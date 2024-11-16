export function showToast(message, type = 'success') {
    // Remove any existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());

    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.opacity = '1';
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Remove toast after 3 seconds with fade out
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast && toast.parentElement) {
                toast.remove();
            }
        }, 300); // Wait for fade out animation
    }, 3000);
}

export function showSuccessToast(message) {
    showToast(message, 'success');
}

export function showErrorToast(message) {
    showToast(message, 'error');
}

export function showWarningToast(message) {
    showToast(message, 'warning');
}