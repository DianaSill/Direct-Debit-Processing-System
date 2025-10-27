import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import mysql from 'mysql2/promise';

// Initialize S3 client
const s3Client = new S3Client({ region: 'eu-west-2' });

// Database configuration from environment variables
const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'customers',
    port: parseInt(process.env.DB_PORT) || 3306
};

// S3 bucket configuration
const CSV_BUCKET = process.env.CSV_BUCKET || 'customer-data-files';
const CSV_FILES = [
    'COUNCIL_A_CUSTOMER_LIST.CSV',
    'COUNCIL_B_CUSTOMER_LIST.CSV'
];

// Function to download and parse CSV from S3
async function downloadAndParseCSV(bucketName, fileName) {
    console.log(`Downloading ${fileName} from S3 bucket ${bucketName}`);
    
    try {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: fileName
        });
        
        const response = await s3Client.send(command);
        const csvContent = await response.Body.transformToString();
        
        console.log(`Downloaded ${fileName}, size: ${csvContent.length} characters`);
        
        // Parse CSV content
        const lines = csvContent.split('\n');
        const records = [];
        
        // Skip header row and process data rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const columns = line.split(',');
                if (columns.length >= 3) {
                    // Determine service from filename
                    const service = fileName.includes('COUNCIL_A') ? 'council-a' : 'council-b';
                    
                    records.push({
                        customer_number: columns[0].replace(/"/g, '').trim(),
                        postcode: columns[1].replace(/"/g, '').trim(), // Preserve spaces in postcodes
                        service: service
                    });
                }
            }
        }
        
        console.log(`Parsed ${records.length} records from ${fileName}`);
        return records;
        
    } catch (error) {
        console.error(`Error downloading/parsing ${fileName}:`, error);
        throw error;
    }
}

// Function to load records into MySQL database
async function loadRecordsToDatabase(records) {
    let connection;
    
    try {
        console.log('Connecting to MySQL database...');
        connection = await mysql.createConnection(DB_CONFIG);
        
        // Truncate existing data
        console.log('Truncating existing customer data...');
        await connection.execute('TRUNCATE TABLE customers');
        
        // Prepare batch insert
        const insertQuery = 'INSERT INTO customers (customer_number, postcode, service, created_at) VALUES ?';
        const values = records.map(record => [
            record.customer_number,
            record.postcode,
            record.service,
            new Date()
        ]);
        
        // Insert records in batches
        const batchSize = 1000;
        let totalInserted = 0;
        
        for (let i = 0; i < values.length; i += batchSize) {
            const batch = values.slice(i, i + batchSize);
            await connection.query(insertQuery, [batch]);
            totalInserted += batch.length;
            console.log(`Inserted batch: ${totalInserted}/${values.length} records`);
        }
        
        console.log(`Successfully loaded ${totalInserted} records to database`);
        return totalInserted;
        
    } catch (error) {
        console.error('Error loading records to database:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

export const handler = async (event) => {
    console.log('CSV Loader Lambda started');
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const startTime = Date.now();
    
    try {
        let allRecords = [];
        
        // Download and parse all CSV files
        for (const fileName of CSV_FILES) {
            const records = await downloadAndParseCSV(CSV_BUCKET, fileName);
            allRecords = allRecords.concat(records);
        }
        
        console.log(`Total records to load: ${allRecords.length}`);
        
        // Load all records to database
        const recordsLoaded = await loadRecordsToDatabase(allRecords);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        const result = {
            success: true,
            recordsLoaded: recordsLoaded,
            filesProcessed: CSV_FILES.length,
            duration: `${duration} seconds`,
            timestamp: new Date().toISOString()
        };
        
        console.log('CSV loading completed:', result);
        
        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
        
    } catch (error) {
        console.error('CSV loading failed:', error);
        
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