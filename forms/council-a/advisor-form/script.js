document.addEventListener('DOMContentLoaded', function () {
    const tncEmailRadio = document.getElementById('tncEmail');
    const tncReadoutRadio = document.getElementById('tncReadout');
    const tncSection = document.getElementById('tnc-section');
    const checkbox = document.querySelector('input[name="agree"]');
    const userDetails = document.querySelector('.user-details');
    const customerInput = document.getElementById('customer_number');
    const postcodeInput = document.getElementById('postcode');
    const emailInput = document.getElementById('email');
    const errorMsg = document.getElementById('customer-number-error');
    const emailErrorMsg = document.getElementById('email-error');
    const statusMsg = document.getElementById('status-message');
    const spinner = document.getElementById('spinner');
    const submitButton = document.querySelector('.submit-button');

    let validatedCustomerData = null;

    // Initial setup
    userDetails.style.display = 'none';
    submitButton.disabled = true;
    submitButton.style.backgroundColor = '#ccc';
    submitButton.style.cursor = 'not-allowed';

    // Show/hide terms and conditions section based on radio selection
    tncEmailRadio.addEventListener('change', function() {
        if (tncEmailRadio.checked) {
            tncSection.style.display = 'none';
        }
    });

    tncReadoutRadio.addEventListener('change', function() {
        if (tncReadoutRadio.checked) {
            tncSection.style.display = 'block';
        }
    });

    // Show/hide user details when checkbox is toggled
    checkbox.addEventListener('change', function () {
        userDetails.style.display = checkbox.checked ? 'block' : 'none';
    });

    // Submit button handler
    submitButton.addEventListener('click', function(e) {
        e.preventDefault();
        
        if (validatedCustomerData && !submitButton.disabled) {
            submitButton.textContent = 'Processing...';
            submitButton.disabled = true;
            
            // Demo mode - simulate redirect to third-party verification
            setTimeout(() => {
                alert('Demo: This would normally redirect the customer to a secure third-party verification service to complete their direct debit setup. As an advisor, you would guide them through this process and the form would then be processed with confirmation sent via email.');
                
                // Reset form for demo purposes
                document.querySelector('form').reset();
                userDetails.style.display = 'none';
                tncSection.style.display = 'none';
                checkbox.checked = false;
                clearErrors();
                disableSubmitButton();
                validatedCustomerData = null;
            }, 1000);
        }
    });

    function validateEmail(email) {
        return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
    }

    function enableSubmitButton() {
        submitButton.disabled = false;
        submitButton.style.backgroundColor = '';
        submitButton.style.cursor = 'pointer';
        submitButton.textContent = 'Proceed';
    }

    function disableSubmitButton() {
        submitButton.disabled = true;
        submitButton.style.backgroundColor = '#ccc';
        submitButton.style.cursor = 'not-allowed';
        submitButton.textContent = 'Proceed';
        validatedCustomerData = null;
    }

    function showError(message) {
        statusMsg.textContent = message;
        statusMsg.style.color = '#d63384';
    }

    function showSuccess(message) {
        statusMsg.textContent = message;
        statusMsg.style.color = 'green';
        statusMsg.style.padding = '12px 12px 20px 12px';
    }

    function clearErrors() {
        errorMsg.style.display = 'none';
        emailErrorMsg.style.display = 'none';
        customerInput.style.borderColor = '';
        emailInput.style.borderColor = '';
        postcodeInput.style.borderColor = '';
        customerInput.setCustomValidity('');
        statusMsg.textContent = '';
    }

    // Debounced validation with demo functionality
    function createDemoValidator() {
        let timeoutID;
        return function () {
            clearTimeout(timeoutID);
            timeoutID = setTimeout(() => {
                const customerNumber = customerInput.value.trim();
                const postcode = postcodeInput.value.trim().toUpperCase().replace(/\\s+/g, '');
                const email = emailInput.value.trim();
                
                const isValidCustomer = /^1000\\d{7}$/.test(customerNumber);
                const isValidEmail = validateEmail(email);

                clearErrors();

                // Email validation
                if (email && !isValidEmail) {
                    emailInput.style.borderColor = '#d63384';
                    emailErrorMsg.textContent = 'Please enter a valid email address';
                    emailErrorMsg.style.display = 'block';
                    emailErrorMsg.style.padding = '12px 12px 20px 12px';
                }

                // Check if customer number and postcode are valid for demo validation
                if (!customerNumber || !postcode || postcode.length < 5 || postcode.length > 7 || !isValidCustomer) {
                    spinner.style.display = 'none';
                    
                    if (!isValidCustomer && customerNumber) {
                        customerInput.style.borderColor = '#d63384';
                        postcodeInput.style.borderColor = '#d63384';
                        errorMsg.textContent = 'Demo: Customer number must start with 1000 and be 11 digits long. Try: 10001234567';
                        errorMsg.style.display = 'block';
                        errorMsg.style.padding = '12px 12px 20px 12px';
                        errorMsg.style.color = '#d63384';
                    }
                    
                    // Check if all fields including email are valid for final submission
                    if (!email || !isValidEmail) {
                        disableSubmitButton();
                    }
                    return;
                }
                
                // Check if email is required for final submission
                const allFieldsValid = email && isValidEmail;

                // Demo validation - simulate API call
                spinner.style.display = 'inline-block';
                disableSubmitButton();

                // Simulate 1 second API response time
                setTimeout(() => {
                    spinner.style.display = 'none';
                    
                    // Demo: Always validate successfully for demo numbers
                    customerInput.style.borderColor = 'green';
                    postcodeInput.style.borderColor = 'green';
                    if (email) emailInput.style.borderColor = 'green';
                    showSuccess('Demo: Customer validated successfully');
                    
                    // Enable submit only if email is also valid
                    if (allFieldsValid) {
                        validatedCustomerData = { customerNumber, postcode, email };
                        enableSubmitButton();
                    } else {
                        disableSubmitButton();
                    }
                }, 1000);
            }, 300);
        };
    }

    const demoValidator = createDemoValidator();
    customerInput.addEventListener('input', demoValidator);
    postcodeInput.addEventListener('input', demoValidator);
    emailInput.addEventListener('input', demoValidator);
});