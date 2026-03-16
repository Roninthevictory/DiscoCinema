// DiscoCinema Discord Activity App - All scripting consolidated here (CSP compliant, no inline scripts)

// Constants
const CLIENT_ID = "1481396281644679259";
const INVITE = "https://discord.gg/SJcdkaJXcf";
const TOS_URL = "https://sites.google.com/view/discocinema/terms";
const PRIVACY_URL = "https://sites.google.com/view/discocinema/privacy";
const DMCA_URL = "https://sites.google.com/view/discocinema/dmca";

// View switching
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

// Legal tab toggle
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

// Universal copy function
function copyText(text, statusEl) {
    const helper = document.getElementById('copy-helper');
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopyFeedback(statusEl, 'Copied!');
        }).catch(err => {
            console.error('Clipboard failed:', err);
            fallbackCopyText(helper, text, statusEl);
        });
    } else {
        fallbackCopyText(helper, text, statusEl);
    }
}

function fallbackCopyText(helper, text, statusEl) {
    helper.value = text;
    helper.select();
    try {
        document.execCommand('copy');
        showCopyFeedback(statusEl, 'Copied!');
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showCopyFeedback(statusEl, 'Copy failed');
    }
}

// Specific copy functions
function copyInviteLink() {
    const statusEl = document.getElementById('copy-status');
    copyText(INVITE, statusEl);
}

function copyTosLink() {
    const statusEl = document.getElementById('tos-copy-status');
    copyText(TOS_URL, statusEl);
}

function copyPrivacyLink() {
    const statusEl = document.getElementById('privacy-copy-status');
    copyText(PRIVACY_URL, statusEl);
}

function copyDmcaLink() {
    const statusEl = document.getElementById('dmca-copy-status');
    copyText(DMCA_URL, statusEl);
}

function fallbackCopy(helper, statusEl) {
    helper.value = INVITE;
    helper.select();
    try {
        document.execCommand('copy');
        showCopyFeedback(statusEl, 'Copied!');
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showCopyFeedback(statusEl, 'Copy failed');
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

// Universal event delegation for clicks
document.addEventListener('click', (e) => {
    // Check for external links first - allow natural navigation
    const legalBtn = e.target.closest('.legal-btn');
    const discordBtn = e.target.closest('.discord-btn');
    if (legalBtn || discordBtn) {
        // Allow default link behavior
        e.stopPropagation();
        return;
    }
    
    e.preventDefault(); // Only prevent for internal handlers
    
    // Nav tabs
    const navTab = e.target.closest('.nav-tab');
    if (navTab) {
        e.stopPropagation();
        const viewId = navTab.dataset.view;
        switchView(viewId, navTab);
        return;
    }

    // Legal tabs
    const legalTab = e.target.closest('.legal-tab');
    if (legalTab) {
        e.stopPropagation();
        const legalType = legalTab.dataset.legal;
        toggleLegal(legalType, legalTab);
        return;
    }

    // Copy boxes (Discord + legal)
    const copyBox = e.target.closest('.copy-box, .legal-copy-box');
    if (copyBox) {
        e.stopPropagation();
        const copyId = copyBox.id || 'default';
        switch(copyId) {
            case 'discord-copy':
            case '': // fallback
                copyInviteLink();
                break;
            case 'tos-copy':
                copyTosLink();
                break;
            case 'privacy-copy':
                copyPrivacyLink();
                break;
            case 'dmca-copy':
                copyDmcaLink();
                break;
        }
        return;
    }
}, true); // Use capture phase for iframe reliability

// Keyboard accessibility
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        const navTab = e.target.closest('.nav-tab');
        if (navTab) {
            e.preventDefault();
            const viewId = navTab.dataset.view;
            switchView(viewId, navTab);
        }
    }
});

// Discord Activity Iframe Resize Handler for perfect fit (FULL SCRIPTING)
let resizeObserver;
function initResizeHandler() {
    function updateScaling() {
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const scale = Math.min(1, Math.max(0.85, (vh / 600) * 1.05)); // Optimized 600px scale
        document.documentElement.style.setProperty('--scale-factor', scale);
        
        // Navbar/content reflow
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.transform = `scale(${scale})`;
        }
        
        // Debug log
        console.log('Iframe scale updated:', scale.toFixed(3), 'vh:', vh);
    }

    // Initial call
    updateScaling();

    // Modern ResizeObserver
    if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(updateScaling);
        resizeObserver.observe(document.body);
        resizeObserver.observe(document.documentElement);
    } 
    
    // Fallback + Discord iframe events
    window.addEventListener('resize', updateScaling);
    window.addEventListener('orientationchange', updateScaling);
    
    // Discord specific events
    window.addEventListener('discord iframe-resize', updateScaling);
}

// DOM ready initialization (FULLY SELF-CONTAINED)
function initApp() {
    console.log('DiscoCinema fully initialized - All scripting in discord-app.js');
    
    // Event handlers
    initResizeHandler();
    
    // Focus management for accessibility
    document.body.tabIndex = 0;
    document.body.focus();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Export for potential SDK use
window.DiscoCinemaApp = {
    switchView,
    toggleLegal,
    copyInviteLink,
    copyTosLink,
    copyPrivacyLink,
    copyDmcaLink,
    initResizeHandler
};

