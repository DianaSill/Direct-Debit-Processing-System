const crypto = require('crypto');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: 'eu-west-2' });

// Configuration from environment variables
const TABLE_NAME = process.env.TABLE_NAME || 'DirectDebitSubmissions';

// Function to get parameter from SSM
async function getParameter(parameterName) {
    const ssmClient = new SSMClient({ region: 'eu-west-2' });
    const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true
    });
    
    try {
        const response = await ssmClient.send(command);
        return response.Parameter.Value;
    } catch (error) {
        console.error('Error getting parameter:', error);
        throw error;
    }
}

// Input validation and sanitization
function validateAndSanitizeInput(customerNumber, postcode, email) {
    // Sanitize customer number - only allow digits and specific prefixes
    const sanitizedCustomerNumber = customerNumber.replace(/[^0-9]/g, '');
    if (!/^(1000|2000)\d{7}$/.test(sanitizedCustomerNumber)) {
        throw new Error('Invalid customer number format');
    }
    
    // Sanitize postcode - only allow alphanumeric and spaces, max 10 chars
    const sanitizedPostcode = postcode.replace(/[^A-Z0-9\s]/g, '').substring(0, 10);
    if (sanitizedPostcode.length < 5) {
        throw new Error('Invalid postcode format');
    }
    
    // Sanitize email - basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }
    
    return { customerNumber: sanitizedCustomerNumber, postcode: sanitizedPostcode, email: email };
}

// CORS validation
function getCorsHeaders(origin) {
    const allowedOrigins = [
        'https://forms.council-a.gov.uk',
        'https://forms.council-b.gov.uk',
        'https://s3.eu-west-2.amazonaws.com'
    ];
    
    const corsOrigin = allowedOrigins.includes(origin) ? origin : 'null';
    
    return {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
        'Content-Type': 'application/json'
    };
}

// Function to determine service from customer number
function determineServiceFromCustomerNumber(customerNumber) {
    if (customerNumber.startsWith('1000')) {
        return 'council-a';
    } else if (customerNumber.startsWith('2000')) {
        return 'council-b';
    } else {
        throw new Error(`Invalid customer number prefix: ${customerNumber}. Must start with 1000 (Council A) or 2000 (Council B)`);
    }
}

// Function to store form submission data
async function storeSubmissionData(submissionData) {
    const params = {
        TableName: TABLE_NAME,
        Item: {
            submissionId: { S: submissionData.submissionId },
            customerNumber: { S: submissionData.customerNumber },
            postcode: { S: submissionData.postcode },
            email: { S: submissionData.email },
            formType: { S: submissionData.formType },
            service: { S: submissionData.service },
            submissionDate: { S: submissionData.submissionDate },
            status: { S: 'pending' },
            exported: { BOOL: false }
        }
    };
    
    try {
        await dynamoClient.send(new PutItemCommand(params));
        console.log('Submission data stored successfully:', submissionData.submissionId);
    } catch (error) {
        console.error('Error storing submission data:', error);
        throw error;
    }
}

// Function to encrypt a query string using third-party encryption
async function encryptQueryString(queryString, sharedSecret) {
    console.log('Query string to encrypt:', queryString);
    
    // AES-256-CBC encryption matching third-party requirements
    const algorithm = 'aes-256-cbc';
    
    // SHA-256 hash the shared secret to create the AES key
    const sha256 = crypto.createHash('sha256');
    sha256.update(sharedSecret);
    const aesKey = sha256.digest();
    
    // Generate random 16-byte IV
    const iv = crypto.randomBytes(16);
    
    // Create cipher and encrypt
    const cipher = crypto.createCipheriv(algorithm, aesKey, iv);
    const cipherText = cipher.update(queryString, 'utf8');
    
    // Concatenate IV + encrypted data, then base64 encode
    const encrypted = Buffer.concat([iv, cipherText, cipher.final()]).toString('base64');
    
    console.log('Encryption successful, length:', encrypted.length);
    return encrypted;
}

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    const origin = event.headers?.origin || event.headers?.Origin;
    const corsHeaders = getCorsHeaders(origin);
    
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }
    
    try {
        // Map service values to organization names
        const serviceMapping = {
            'council-a': 'council-a',
            'council-b': 'council-b'
        };        
        
        // Extract parameters from POST body or query string
        let parameters;
        if (event.httpMethod === 'POST' && event.body) {
            parameters = new URLSearchParams(event.body);
        } else {
            parameters = new URLSearchParams(Object.entries(event.queryStringParameters || {}));
        }
        
        const rawCustomerNumber = parameters.get('customer-number') || parameters.get('customer_number');
        const rawPostcode = parameters.get('postcode');
        const rawEmail = parameters.get('email');
        const formType = parameters.get('form_type'); // user or advisor
        const requestedService = parameters.get('service'); // council-a or council-b (optional now)

        // Validate required parameters
        if (!rawCustomerNumber || !rawPostcode || !rawEmail) {
            console.log('Missing parameters error');
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: 'Missing required parameters: customer-number, postcode, and email'
                })
            };
        }
        
        // Validate and sanitize inputs
        const sanitized = validateAndSanitizeInput(rawCustomerNumber, rawPostcode.toUpperCase(), rawEmail);
        const customerNumber = sanitized.customerNumber;
        const postcode = sanitized.postcode;
        const email = sanitized.email;

        // Automatically determine service from customer number
        const determinedService = determineServiceFromCustomerNumber(customerNumber);
        console.log(`Customer number ${customerNumber} determined as service: ${determinedService}`);

        // If service was provided, validate it matches the customer number
        if (requestedService && requestedService !== determinedService) {
            console.log(`Service mismatch: requested ${requestedService}, but customer number ${customerNumber} requires ${determinedService}`);
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    error: `Service mismatch: Customer number ${customerNumber} requires '${determinedService}' service, but '${requestedService}' was requested.`
                })
            };
        }

        // Use determined service
        const service = determinedService;
        const organization = serviceMapping[service];
        
        // Build parameter path dynamically
        const parameterPath = `/forms/${organization}/test/ThirdPartySharedSecret`;
        const SHARED_SECRET = await getParameter(parameterPath);
        
        console.log('Extracted values:', {
            customerNumber: customerNumber,
            postcode: postcode,
            email: email,
            formType: formType,
            service: service,
            determinedFromCustomerNumber: true
        });
        
        // Generate unique submission ID using built-in crypto
        const submissionId = crypto.randomUUID();
        const submissionDate = new Date().toISOString();
        
        // Store submission data in DynamoDB
        await storeSubmissionData({
            submissionId,
            customerNumber,
            postcode,
            email,
            formType: formType || 'advisor',
            service: service,
            submissionDate
        });
        
        // Build the complete query string to encrypt based on form type and service
        let completeQueryString;
        let baseUrl;
        
        // Add submissionId AND CallbackURL to the encrypted data for third-party to send back in callback
        const callbackURL = process.env.CALLBACK_URL || 'https://api.example.com/webhook-callback';
        const baseCustomerData = `customer_number=${customerNumber}&postcode=${postcode}&CurrentPostcode=${postcode}&Email=${email}&EmailRetype=${email}&CustomData=${submissionId}&CallbackURL=${callbackURL}`;
        
        if (formType === 'user') {
            if (service === 'council-a') {
                // User Council A form
                baseUrl = 'https://verification.thirdparty.com/forms/council-a/customer';
                completeQueryString = `${baseCustomerData}&DdPlanReference=${customerNumber}&showddplanreference=visible&showdob=hidden&showmobile=hidden`;
                console.log('User Council A form detected');
            } else {
                // User Council B form
                baseUrl = 'https://verification.thirdparty.com/forms/council-b/customer';
                completeQueryString = `${baseCustomerData}&DdPlanReference=${customerNumber}&showddplanreference=visible&showdob=hidden&showmobile=hidden`;
                console.log('User Council B form detected');
            }
        } else {
            // Advisor forms
            if (service === 'council-a') {
                // Advisor Council A form
                baseUrl = 'https://verification.thirdparty.com/forms/council-a/agent';
                completeQueryString = `${baseCustomerData}&DdPlanReference=${customerNumber}&showddplanfields=hidden&applyingascompany=false&showapplyingascompanycheck=hidden&showdob=hidden&showmobile=hidden`;
                console.log('Advisor Council A form detected');
            } else {
                // Advisor Council B form (default)
                baseUrl = 'https://verification.thirdparty.com/forms/council-b/agent';
                completeQueryString = `${baseCustomerData}&DdPlanReference=${customerNumber}&showddplanfields=hidden&applyingascompany=false&showapplyingascompanycheck=hidden&showdob=hidden&showmobile=hidden`;
                console.log('Advisor Council B form detected (or default)');
            }
        }
        
        // Encrypt the complete query string
        const encryptedCompleteQueryString = await encryptQueryString(completeQueryString, SHARED_SECRET);
        
        // Build the final redirect URL with only the encrypted data
        const redirectUrl = `${baseUrl}?eData=${encodeURIComponent(encryptedCompleteQueryString)}`;
        
        console.log('Generated redirect URL:', redirectUrl);
        console.log('Stored submission with ID:', submissionId);
        console.log('CallbackURL included in encrypted data:', callbackURL);
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                submissionId: submissionId,
                encryptedData: encryptedCompleteQueryString,
                redirectUrl: redirectUrl,
                formType: formType || 'advisor',
                service: service
            })
        };
        
    } catch (error) {
        console.error('Error in Lambda function:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};