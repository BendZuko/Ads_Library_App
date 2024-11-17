export function initializeTokenManager() {
    checkTokenExpiration();
    document.getElementById('refreshTokenBtn').addEventListener('click', refreshToken);
}

async function checkTokenExpiration() {
    try {
        const response = await fetch('/api/token-info');
        const data = await response.json();
        
        if (data.daysUntilExpiration) {
            document.getElementById('tokenDays').textContent = data.daysUntilExpiration;
        }
    } catch (error) {
        console.error('Error checking token expiration:', error);
        document.getElementById('tokenDays').textContent = 'Error';
    }
}

async function refreshToken() {
    const button = document.getElementById('refreshTokenBtn');
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';

    try {
        const response = await fetch('/api/refresh-token', {
            method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('tokenDays').textContent = data.daysUntilExpiration;
            showSuccessToast('Token refreshed successfully');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
        showErrorToast('Failed to refresh token');
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Token';
    }
}