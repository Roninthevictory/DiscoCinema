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
    console.log('Switching to view:', viewId);

    // Update Navbar buttons
    document.querySelectorAll('.navbar .nav-tab:not(.legal-subtab)').forEach(btn => btn.classList.remove('active'));
    triggerEl.classList.add('active');

    // Switch main views
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
        target.style.opacity = '1';
    }
}

/**
 * Handle Legal Sub-navigation
 */
function handleLegalSwitch(legalId, triggerEl) {
    if (!legalId || !triggerEl) return;
    console.log('Legal switch to:', legalId);

    const legalParent = document.getElementById('legal');
    if (!legalParent) {
        console.warn('Legal container not found');
        return;
    }

    // Update legal sub-tabs only
    legalParent.querySelectorAll('.legal-subtab').forEach(btn => btn.classList.remove('active'));
    triggerEl.classList.add('active');

    // Switch legal sections
    document.querySelectorAll('.legal-section').forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
    });

    const target = document.getElementById(legalId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
    }
}

/**
 * Clipboard handling with robust fallback
 */
async function copyToClipboard(text, statusEl) {
    if (!statusEl) return;
    
    const fallbackCopy = (str) => {
        const el = document.createElement('textarea');
        el.value = str;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        el.style.opacity = '0';
        el.setAttribute('readonly', '');
        document.body.appendChild(el);
        const wasSelectable = document.body.style.userSelect;
        document.body.style.userSelect = 'text';
        el.focus();
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        document.body.style.userSelect = wasSelectable;
        return ok;
    };

    try {
        let success = false;
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            success = true;
        } else {
            success = fallbackCopy(text);
        }
        
        const oldText = statusEl.textContent;
        statusEl.textContent = 'COPIED!';
        statusEl.style.color = 'var(--success)';
        setTimeout(() => {
            statusEl.textContent = oldText;
            statusEl.style.color = '';
        }, 1500);
        return success;
    } catch (e) {
        console.error('Copy failed:', e);
        statusEl.textContent = 'FAILED';
        statusEl.style.color = '#ef4444';
        setTimeout(() => {
            statusEl.textContent = 'CLICK TO COPY';
            statusEl.style.color = '';
        }, 1500);
    }
}

/**
 * Global Event Delegation
 */
document.addEventListener('click', async (e) => {
    console.log('Click target:', e.target); // Debug
    
    // 1. Legal Sub-tabs
    const legalBtn = e.target.closest('.legal-subtab');
    if (legalBtn && legalBtn.dataset.legal) {
        e.preventDefault();
        console.log('Legal tab clicked:', legalBtn.dataset.legal);
        handleLegalSwitch(legalBtn.dataset.legal, legalBtn);
        return;
    }

    // 2. Main Nav
    const navBtn = e.target.closest('.nav-tab');
    if (navBtn && navBtn.dataset.view) {
        if (navBtn.classList.contains('legal-subtab')) return; // Skip if legal
        e.preventDefault();
        console.log('Nav clicked:', navBtn.dataset.view);
        handleViewSwitch(navBtn.dataset.view, navBtn);
        return;
    }

    // 3. Copy Boxes
    const copyBox = e.target.closest('.copy-box');
    if (copyBox) {
        e.preventDefault();
        const statusEl = copyBox.querySelector('.copy-status');
        if (!statusEl) return;
        
        const id = copyBox.id;
        let text = '';
        if (id === 'discord-copy') text = CONFIG.INVITE;
        else if (id === 'tos-copy') text = CONFIG.TOS;
        else if (id === 'privacy-copy') text = CONFIG.PRIVACY;
        else if (id === 'dmca-copy') text = CONFIG.DMCA;
        
        if (text) {
            console.log('Copying:', text);
            await copyToClipboard(text, statusEl);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    console.log("DiscoCinema UI Ready");
    
    // Set initial legal state
    const legalView = document.getElementById('legal');
    if (legalView) {
        handleLegalSwitch('tos', document.querySelector('.legal-subtab[data-legal="tos"]'));
    }
    
    // Ensure home is active initially
    handleViewSwitch('home', document.querySelector('.nav-tab[data-view="home"]'));
});
