export function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

export function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function validateSearchData(data) {
    return data && 
           Array.isArray(data.results) && 
           data.results.length > 0;
}