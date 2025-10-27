const { DynamoDBClient, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: 'eu-west-2' });

// Configuration from environment variables
const TABLE_NAME = process.env.TABLE_NAME || 'DirectDebitSubmissions';

// CORS validation for webhook
function getCorsHeaders(origin) {
    const allowedOrigins = [
        'https://verification.thirdparty.com'
    ];
    
    const corsOrigin = allowedOrigins.includes(origin) ? origin : 'null';
    
    return {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
        'Content-Type': 'application/json'
    };
}

// Function to update submission status in DynamoDB
async function updateSubmissionStatus(submissionId, status, webhookData) {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            submissionId: { S: submissionId }
        },
        UpdateExpression: 'SET #status = :status, #webhookData = :webhookData, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#webhookData': 'webhookData',
            '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
            ':status': { S: status },
            ':webhookData': { S: JSON.stringify(webhookData) },
            ':updatedAt': { S: new Date().toISOString() }
        }
    };
    
    try {
        await dynamoClient.send(new UpdateItemCommand(params));
        console.log(`Updated submission ${submissionId} with status: ${status}`);
    } catch (error) {
        console.error('Error updating submission status:', error);
        throw error;
    }
}

// Function to get submission from DynamoDB
async function getSubmission(submissionId) {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            submissionId: { S: submissionId }
        }
    };
    
    try {
        const result = await dynamoClient.send(new GetItemCommand(params));
        return result.Item;
    } catch (error) {
        console.error('Error getting submission:', error);
        throw error;
    }
}

exports.handler = async (event) => {
    console.log('Webhook received:', JSON.stringify(event, null, 2));
    
    const origin = event.headers?.origin || event.headers?.Origin;
    const corsHeaders = getCorsHeaders(origin);
    
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }
    
    try {
        let webhookData;
        
        // Parse webhook data from POST body
        if (event.httpMethod === 'POST' && event.body) {
            try {
                webhookData = JSON.parse(event.body);
            } catch (parseError) {
                // If JSON parsing fails, try URL-encoded form data
                const params = new URLSearchParams(event.body);
                webhookData = Object.fromEntries(params);
            }
        } else {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Invalid request method or missing body' })
            };
        }
        
        console.log('Parsed webhook data:', webhookData);
        
        // Extract submission ID from CustomData field
        const submissionId = webhookData.CustomData;
        
        if (!submissionId) {
            console.error('No CustomData (submission ID) found in webhook');
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Missing CustomData field' })
            };
        }
        
        // Check if submission exists
        const existingSubmission = await getSubmission(submissionId);
        if (!existingSubmission) {
            console.error(`Submission not found: ${submissionId}`);
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Submission not found' })
            };
        }
        
        // Determine status based on verification result
        let status;
        if (webhookData.VerificationStatus === 'True' || webhookData.VerificationStatus === true) {
            status = 'approved';
            console.log(`Submission ${submissionId} approved`);
        } else {
            status = 'failed';
            console.log(`Submission ${submissionId} failed verification`);
        }
        
        // Update submission status in DynamoDB
        await updateSubmissionStatus(submissionId, status, webhookData);
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                submissionId: submissionId,
                status: status,
                message: `Submission ${submissionId} updated with status: ${status}`
            })
        };
        
    } catch (error) {
        console.error('Error processing webhook:', error);
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