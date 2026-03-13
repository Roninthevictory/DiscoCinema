// CinemaSync Discord Activity App - CSP Compliant
const CLIENT_ID = "1481396281644679259";
const INVITE = "https://discord.gg/SJcdkaJXcf";

function switchTab(viewId, el) {
    console.log('Tab clicked:', viewId);
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
}

function toggleLegal(type) {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.legal-text-section').forEach(s => s.classList.remove('active'));
    document.getElementById('btn-' + type).classList.add('active');
    document.getElementById('text-' + type).classList.add('active');
    document.querySelector('.legal-content-scroll').scrollTop = 0;
}

function copyInvite() {
    const status = document.getElementById('status');
    const helper = document.getElementById('copy-helper');
    helper.value = INVITE;
    helper.select();
    document.execCommand('copy');
    status.textContent = "COPIED TO CLIPBOARD!";
    status.style.color = "#23A55A";
    setTimeout(() => {
        status.textContent = "Click to copy link";
        status.style.color = "#5865F2";
    }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
    // Nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const viewId = tab.dataset.tab || tab.textContent.trim().toLowerCase();
            switchTab(viewId, tab);
        });
    });

    // Copy
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyInvite();
        });
    }

    // Legal toggles
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const type = btn.id.replace('btn-', '');
            toggleLegal(type);
        });
    });

    console.log('CinemaSync Discord Activity ready');
});
