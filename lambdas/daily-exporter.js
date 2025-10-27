const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: 'eu-west-2' });
const s3Client = new S3Client({ region: 'eu-west-2' });

// Configuration from environment variables
const TABLE_NAME = process.env.TABLE_NAME || 'DirectDebitSubmissions';
const EXPORT_BUCKET = process.env.EXPORT_BUCKET || 'export-files-to-erp';

// Function to scan DynamoDB for approved, unexported records
async function getApprovedRecords() {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status AND #exported = :exported',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#exported': 'exported'
        },
        ExpressionAttributeValues: {
            ':status': { S: 'approved' },
            ':exported': { BOOL: false }
        }
    };
    
    try {
        const result = await dynamoClient.send(new ScanCommand(params));
        console.log(`Found ${result.Items.length} approved, unexported records`);
        return result.Items;
    } catch (error) {
        console.error('Error scanning DynamoDB:', error);
        throw error;
    }
}

// Function to convert DynamoDB record to fixed-width format
function recordToFixedWidth(record) {
    // Extract data from DynamoDB item
    const customerNumber = record.customerNumber?.S || '';
    const email = record.email?.S || '';
    const submissionDate = record.submissionDate?.S || '';
    
    // Parse submission date for formatting
    const date = new Date(submissionDate);
    const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    
    // Build fixed-width record (606 characters total)
    let fixedWidthRecord = '';
    
    // Position 1-2: Record type (always "2")
    fixedWidthRecord += '2'.padStart(2, ' ');
    
    // Position 3-27: Customer number (right-aligned, 25 chars)
    fixedWidthRecord += customerNumber.padStart(25, ' ');
    
    // Position 28-31: Filler spaces
    fixedWidthRecord += '    ';
    
    // Position 32-66: Bank account number (placeholder - would come from third-party data)
    fixedWidthRecord += '1234567890123456789012345'.padStart(35, ' ');
    
    // Position 67-192: Various filler fields (126 chars)
    fixedWidthRecord += ' '.repeat(126);
    
    // Position 193-447: Special field with date + email (255 chars)
    const specialField = `AR_40_DDI_${formattedDate} ##${email}## `;
    fixedWidthRecord += specialField.padEnd(255, ' ');
    
    // Position 448-529: More filler fields (82 chars)
    fixedWidthRecord += ' '.repeat(82);
    
    // Position 530-531: Transaction type (always "DD")
    fixedWidthRecord += 'DD';
    
    // Position 532-559: Filler spaces (28 chars)
    fixedWidthRecord += ' '.repeat(28);
    
    // Position 560: Status flag (always "W")
    fixedWidthRecord += 'W';
    
    // Position 561-606: Final filler spaces (46 chars)
    fixedWidthRecord += ' '.repeat(46);
    
    // Ensure exactly 606 characters
    if (fixedWidthRecord.length !== 606) {
        console.warn(`Record length mismatch: expected 606, got ${fixedWidthRecord.length}`);
        fixedWidthRecord = fixedWidthRecord.substring(0, 606).padEnd(606, ' ');
    }
    
    return fixedWidthRecord;
}

// Function to mark records as exported
async function markRecordsAsExported(submissionIds) {
    const updatePromises = submissionIds.map(submissionId => {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                submissionId: { S: submissionId }
            },
            UpdateExpression: 'SET #exported = :exported, #exportedAt = :exportedAt',
            ExpressionAttributeNames: {
                '#exported': 'exported',
                '#exportedAt': 'exportedAt'
            },
            ExpressionAttributeValues: {
                ':exported': { BOOL: true },
                ':exportedAt': { S: new Date().toISOString() }
            }
        };
        
        return dynamoClient.send(new UpdateItemCommand(params));
    });
    
    try {
        await Promise.all(updatePromises);
        console.log(`Marked ${submissionIds.length} records as exported`);
    } catch (error) {
        console.error('Error marking records as exported:', error);
        throw error;
    }
}

// Function to upload export file to S3
async function uploadExportFile(fileName, fileContent) {
    const params = {
        Bucket: EXPORT_BUCKET,
        Key: fileName,
        Body: fileContent,
        ContentType: 'text/plain'
    };
    
    try {
        await s3Client.send(new PutObjectCommand(params));
        console.log(`Uploaded export file: ${fileName}`);
    } catch (error) {
        console.error('Error uploading export file:', error);
        throw error;
    }
}

exports.handler = async (event) => {
    console.log('Daily Export Lambda started');
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const startTime = Date.now();
    
    try {
        // Get approved, unexported records
        const records = await getApprovedRecords();
        
        if (records.length === 0) {
            console.log('No records to export');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    recordsExported: 0,
                    message: 'No records to export'
                })
            };
        }
        
        // Convert records to fixed-width format
        const fixedWidthLines = records.map(record => recordToFixedWidth(record));
        const fileContent = fixedWidthLines.join('\n');
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
        const fileName = `DIRECT_DEBIT_EXPORT_${timestamp}.txt`;
        
        // Upload to S3
        await uploadExportFile(fileName, fileContent);
        
        // Mark records as exported
        const submissionIds = records.map(record => record.submissionId.S);
        await markRecordsAsExported(submissionIds);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        const result = {
            success: true,
            recordsExported: records.length,
            fileName: fileName,
            fileSize: fileContent.length,
            duration: `${duration} seconds`,
            timestamp: new Date().toISOString()
        };
        
        console.log('Export completed:', result);
        
        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
        
    } catch (error) {
        console.error('Export failed:', error);
        
        const errorResult = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
        
        return {
            statusCode: 500,
            body: JSON.stringify(errorResult)
        };
    }
};