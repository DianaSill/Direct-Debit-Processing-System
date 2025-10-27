const mysql = require('mysql2/promise');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({ region: 'eu-west-2' });
const SECRET_NAME = 'rds-credentials-secret';

// Get RDS credentials from Secrets Manager
async function getRDSCredentials() {
    try {
        const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });
        const response = await secretsClient.send(command);
        const secret = JSON.parse(response.SecretString);
        
        return {
            host: process.env.DB_HOST, // RDS-managed secrets don't include host
            user: secret.username,
            password: secret.password,
            database: process.env.DB_NAME || 'customers',
            port: parseInt(process.env.DB_PORT) || 3306
        };
    } catch (error) {
        console.error('Failed to retrieve RDS credentials from Secrets Manager:', error);
        throw error;
    }
}

// Input validation and sanitization
function validateAndSanitizeInput(customerNumber, postcode) {
    // Sanitize customer number - only allow digits and specific prefixes
    const sanitizedCustomerNumber = customerNumber.replace(/[^0-9]/g, '');
    if (!/^(1000|2000)\d{7}$/.test(sanitizedCustomerNumber)) {
        throw new Error('Invalid customer number format');
    }
    
    // Sanitize postcode - only allow alphanumeric and spaces, max 10 chars
    const sanitizedPostcode = postcode.replace(/[^A-Z0-9\s]/g, '').substring(0, 10);
    if (sanitizedPostcode.replace(/\s/g, '').length < 5) {
        throw new Error('Invalid postcode format');
    }
    
    return { customerNumber: sanitizedCustomerNumber, postcode: sanitizedPostcode };
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
        'Content-Type': 'application/json'
    };
}

exports.handler = async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin;
    console.log('Request origin:', origin);
    const corsHeaders = getCorsHeaders(origin);
    
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }
    
    const customerNumber = event.queryStringParameters?.customer_number?.trim() || '';
    const postcode = event.queryStringParameters?.postcode?.trim().toUpperCase() || '';
    
    try {
        // Validate and sanitize inputs
        const sanitized = validateAndSanitizeInput(customerNumber, postcode);
        const validCustomerNumber = sanitized.customerNumber;
        const validPostcode = sanitized.postcode;
        
        if (!validCustomerNumber || !validPostcode) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Invalid input parameters' })
            };
        }
    
        let connection;
        try {
            // Get RDS credentials from Secrets Manager
            const dbConfig = await getRDSCredentials();
            
            // Connect to MySQL
            connection = await mysql.createConnection(dbConfig);
            
            // Query database for customer using sanitized inputs
            // Use REPLACE to normalize spaces for comparison
            const [rows] = await connection.execute(
                'SELECT customer_number FROM customers WHERE customer_number = ? AND REPLACE(postcode, " ", "") = REPLACE(?, " ", "") LIMIT 1',
                [validCustomerNumber, validPostcode]
            );
            
            if (rows.length > 0) {
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Valid customer and postcode' })
                };
            } else {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'No match for customer number and postcode' })
                };
            }
            
        } catch (error) {
            console.error(`Database error: ${error}`);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Unable to verify customer details. Please try again.' })
            };
        } finally {
            if (connection) {
                await connection.end();
            }
        }
    } catch (error) {
        console.error(`Validation error: ${error}`);
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
        };
    }
};