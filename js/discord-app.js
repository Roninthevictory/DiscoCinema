/**
 * DiscoCinema Discord Activity App Logic
 * v1.0.6 - Fixed disappearance bug in legal sub-tabs
 */

const CONFIG = {
    INVITE: "https://discord.gg/SJcdkaJXcf",
    TOS: "https://sites.google.com/view/discocinema/terms",
    PRIVACY: "https://sites.google.com/view/discocinema/privacy",
    DMCA: "https://sites.google.com/view/discocinema/dmca"
};

/**
 * Handle Main View Navigation
 */
function handleViewSwitch(viewId, triggerEl) {
    if (!viewId || !triggerEl) return;

    // 1. Update Buttons
    document.querySelectorAll('.navbar .nav-tab').forEach(btn => btn.classList.remove('active'));
    triggerEl.classList.add('active');

    // 2. Switch Views
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
    }
}

/**
 * Handle Legal Sub-navigation
 */
function handleLegalSwitch(legalId, triggerEl) {
    if (!legalId || !triggerEl) return;

    // 1. Target specifically within legal container
    const legalParent = document.getElementById('legal');
    if (!legalParent) return;

    // 2. Update sub-tab buttons
    legalParent.querySelectorAll('.legal-subtab').forEach(btn => btn.classList.remove('active'));
    triggerEl.classList.add('active');

    // 3. Update sections
    legalParent.querySelectorAll('.legal-section').forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
    });

    const target = document.getElementById(legalId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex'; // Ensure it shows as flex for centering
    }
}

/**
 * Clipboard handling with robust fallback
 */
async function copyToClipboard(text, statusId) {
    const statusEl = document.getElementById(statusId);
    
    const fallbackCopy = (str) => {
        const el = document.createElement('textarea');
        el.value = str;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        return ok;
    };

    try {
        let success = false;
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            success = true;
        } else {
            success = fallbackCopy(text);
        }
        
        if (success && statusEl) {
            const old = statusEl.textContent;
            statusEl.textContent = "COPIED!";
            statusEl.style.color = "var(--success)";
            setTimeout(() => {
                statusEl.textContent = old;
                statusEl.style.color = "";
            }, 1500);
        }
    } catch (e) {
        console.error("Copy error", e);
    }
}

/**
 * Global Event Delegation
 */
document.addEventListener('click', (e) => {
    // 1. Legal Sub-tabs (Handle first to stop propagation)
    const legalBtn = e.target.closest('.legal-subtab');
    if (legalBtn && legalBtn.dataset.legal) {
        e.preventDefault();
        e.stopPropagation();
        handleLegalSwitch(legalBtn.dataset.legal, legalBtn);
        return;
    }

    // 2. Main Nav
    const navBtn = e.target.closest('.nav-tab:not(.legal-subtab)');
    if (navBtn && navBtn.dataset.view) {
        e.preventDefault();
        handleViewSwitch(navBtn.dataset.view, navBtn);
        return;
    }

    // 3. Copy Boxes
    const copyBox = e.target.closest('.copy-box');
    if (copyBox) {
        const statusEl = copyBox.querySelector('.copy-status');
        if (!statusEl) return;
        
        const id = copyBox.id;
        if (id === 'discord-copy') copyToClipboard(CONFIG.INVITE, statusEl.id);
        else if (id === 'tos-copy') copyToClipboard(CONFIG.TOS, statusEl.id);
        else if (id === 'privacy-copy') copyToClipboard(CONFIG.PRIVACY, statusEl.id);
        else if (id === 'dmca-copy') copyToClipboard(CONFIG.DMCA, statusEl.id);
    }
});

window.onload = () => {
    console.log("DiscoCinema UI Ready");
    // Ensure legal view starts with correct state just in case
    handleLegalSwitch('tos', document.querySelector('.legal-subtab[data-legal="tos"]'));
};
