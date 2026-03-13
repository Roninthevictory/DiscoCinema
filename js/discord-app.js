// DiscoCinema Discord Activity App - CSP Compliant
const CLIENT_ID = "1481396281644679259";
const INVITE = "https://discord.gg/SJcdkaJXcf";

function switchView(viewId, el) {
    console.log('View switch:', viewId);
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    
    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }
}

function toggleLegal(type, btn) {
    console.log('Legal toggle:', type);
    // Update legal tabs
    document.querySelectorAll('.legal-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    
    // Update legal sections
    document.querySelectorAll('.legal-section').forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById(type);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Smooth scroll to top
    const scrollContainer = document.querySelector('.legal-content');
    if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function copyInviteLink() {
    const statusEl = document.getElementById('copy-status');
    const helper = document.getElementById('copy-helper');
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(INVITE).then(() => {
            showCopyFeedback(statusEl, 'Copied!');
        });
    } else {
        // Fallback
        helper.value = INVITE;
        helper.select();
        document.execCommand('copy');
        showCopyFeedback(statusEl, 'Copied!');
    }
}

function showCopyFeedback(statusEl, message) {
    if (statusEl) {
        const original = statusEl.textContent;
        statusEl.textContent = message;
        statusEl.style.color = "var(--success)";
        
        setTimeout(() => {
            statusEl.textContent = original;
            statusEl.style.color = "var(--blurple)";
        }, 2200);
    }
}

// Universal event delegation
document.addEventListener('click', (e) => {
    // Nav tabs
    const navTab = e.target.closest('.nav-tab');
    if (navTab) {
        e.preventDefault();
        e.stopPropagation();
        const viewId = navTab.dataset.view;
        switchView(viewId, navTab);
        return;
    }

    // Legal tabs
    const legalTab = e.target.closest('.legal-tab');
    if (legalTab) {
        e.preventDefault();
        e.stopPropagation();
        const legalType = legalTab.dataset.legal;
        toggleLegal(legalType, legalTab);
        return;
    }

    // Copy box
    const copyBox = e.target.closest('.copy-box');
    if (copyBox) {
        e.preventDefault();
        e.stopPropagation();
        copyInviteLink();
        return;
    }
});

// Keyboard accessibility
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('nav-tab')) {
        e.preventDefault();
        const viewId = e.target.dataset.view;
        switchView(viewId, e.target);
    }
});

console.log('DiscoCinema ready - Event delegation active');

