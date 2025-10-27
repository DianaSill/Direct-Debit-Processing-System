# Direct Debit Processing System - Portfolio Version

**For the complete case study with detailed technical analysis, see [CASE_STUDY.md](CASE_STUDY.md)**

## Overview

A serverless direct debit form processing system built from scratch for local government councils. This system replaced manual phone-based direct debit setup with 24/7 self-service capability, handling customer validation, third-party verification, and automated daily exports.

**⚠️ Note: This is a sanitized version for portfolio purposes. All sensitive data, URLs, and identifiers have been anonymized.**

## Key Features

- **Real-time Customer Validation** (300-600ms response time)
- **Secure Third-party Integration** with encrypted data transmission
- **Automated Daily Processing** of 200k+ customer records
- **Comprehensive Monitoring** with email alerts
- **VPC-secured Architecture** with private database access

## Technology Stack

- **Frontend**: HTML5, JavaScript (ES6+), CSS3
- **Backend**: AWS Lambda (Node.js 22.x)
- **Database**: Amazon RDS MySQL, DynamoDB
- **Storage**: Amazon S3
- **API**: Amazon API Gateway
- **Security**: AWS Secrets Manager, VPC networking
- **Monitoring**: CloudWatch, SNS notifications
- **Automation**: EventBridge scheduled rules

## Architecture

```
Web Forms (S3) → API Gateway → Lambda Functions → RDS MySQL (200k+ records)
                                     ↓
Third-party Service ← Webhook ← DynamoDB (submissions)
                                     ↓
                              Daily Export → S3 (ERP files)
```

## Performance Metrics

- **Service Availability**: 24/7 self-service (previously business hours only)
- **Validation Speed**: 300-600ms real-time customer lookup
- **Daily Processing**: 200,000+ customer records
- **System Availability**: 99.9% uptime
- **Processing Time**: 8 seconds for full data refresh

## Project Structure

```
portfolio/
├── CASE_STUDY.md           # Detailed project case study
├── README.md               # This file
├── lambdas/                # Sanitized Lambda functions
│   ├── customer-validator.js
│   ├── form-processor.js
│   ├── webhook-handler.js
│   ├── csv-loader.js
│   └── daily-exporter.js
└── forms/                  # Sanitized HTML forms
    ├── council-a/          # Council A forms
    │   ├── user-form/
    │   └── advisor-form/
    └── council-b/          # Council B forms
        ├── user-form/
        └── advisor-form/
```

## Key Achievements

### Digital Transformation
- Complete self-service solution replacing manual phone processes
- Real-time customer validation (300-600ms response)
- 24/7 availability with automated processing
- Eliminated manual data entry and associated errors

### Security Implementation
- VPC networking with private subnet isolation
- AWS Secrets Manager for automatic password rotation
- Input validation and sanitization
- CORS protection and encrypted data transmission

### Automation & Reliability
- Event-driven serverless architecture
- Automated daily data processing
- Comprehensive error handling and monitoring
- Real-time alerting system

## Security Features

- **Network Isolation**: VPC with private subnets
- **Data Encryption**: AES-256-CBC for third-party transmission
- **Input Validation**: Comprehensive sanitization
- **Access Control**: Restricted CORS origins
- **Credential Management**: Automated rotation via Secrets Manager

## Monitoring & Alerts

- **CloudWatch Metrics**: Performance and error tracking
- **SNS Notifications**: Email alerts for system failures
- **Comprehensive Logging**: Detailed error and performance logs
- **Automated Recovery**: Self-healing mechanisms

## Development Highlights

### Database Design
- Optimized MySQL schema with proper indexing
- Flexible postcode matching (with/without spaces)
- Service-specific customer number validation
- Daily data refresh automation

### API Design
- RESTful endpoints with proper HTTP status codes
- CORS-compliant headers
- Input validation and error handling
- Rate limiting and security controls

### Integration Patterns
- Webhook-based asynchronous processing
- Encrypted data exchange with third parties
- Event-driven workflow automation
- Retry mechanisms and error recovery

## Lessons Learned

- **VPC Networking**: Proper endpoint configuration is crucial for serverless functions
- **Performance**: Database optimization can provide dramatic improvements
- **Security**: Implement security controls from the ground up
- **Monitoring**: Comprehensive observability prevents issues before they impact users

---

## Contact

This project demonstrates expertise in:
- Cloud architecture and serverless computing
- Database optimization and performance tuning
- Security implementation and compliance
- Third-party API integration
- Automated testing and deployment
