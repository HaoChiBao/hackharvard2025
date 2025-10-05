
document.addEventListener('DOMContentLoaded', function () {
    // Get all page elements
    const pages = document.querySelectorAll('.page');

    // Helper to show one page and hide others
    function showPage(index) {
        pages.forEach((page, i) => {
            page.style.display = (i === index) ? 'block' : 'none';
        });
    }

    // Initial state: show first page
    showPage(0);

    // Create a button to toggle pages
    const toggleBtn = document.getElementById('test');
    let currentPage = 0;
    toggleBtn.addEventListener('click', function () {
        currentPage = (currentPage + 1) % pages.length;
        showPage(currentPage);
    });
});