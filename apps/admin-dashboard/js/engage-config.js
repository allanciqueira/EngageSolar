/**
 * Engage Config — tela própria com subnav (separado de Configurações / ReservaAI).
 */
(function () {
  const DEFAULT_TAB = 'meta-connections';
  const STORAGE_KEY = 'engage-config-tab';

  let active = false;
  let bound = false;
  let currentTab = DEFAULT_TAB;
  let currentSession = null;

  function getRoot() {
    return document.getElementById('engageConfigRoot');
  }

  function setActiveTab(tabId) {
    const root = getRoot();
    if (!root) return;

    currentTab = tabId;
    try {
      sessionStorage.setItem(STORAGE_KEY, tabId);
    } catch (_err) {
      /* ignore */
    }

    root.querySelectorAll('[data-ec-tab]').forEach((btn) => {
      const isActive = btn.dataset.ecTab === tabId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
    });

    root.querySelectorAll('[data-ec-panel]').forEach((panel) => {
      const isActive = panel.dataset.ecPanel === tabId;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });

    if (active) {
      onTabActivated(tabId, currentSession);
    }
  }

  function bindSubnav() {
    if (bound) return;
    const root = getRoot();
    if (!root) return;

    const subnav = root.querySelector('#engageConfigSubnav');
    if (!subnav) return;

    subnav.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-ec-tab]');
      if (!btn || !subnav.contains(btn)) return;
      setActiveTab(btn.dataset.ecTab);
    });

    subnav.addEventListener('keydown', (event) => {
      const tabs = [...subnav.querySelectorAll('[data-ec-tab]')];
      const idx = tabs.findIndex((t) => t.classList.contains('is-active'));
      if (idx < 0) return;

      let next = idx;
      if (event.key === 'ArrowRight') next = Math.min(idx + 1, tabs.length - 1);
      else if (event.key === 'ArrowLeft') next = Math.max(idx - 1, 0);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;

      event.preventDefault();
      const tab = tabs[next];
      setActiveTab(tab.dataset.ecTab);
      tab.focus();
    });

    bound = true;
  }

  function restoreTab() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved && getRoot()?.querySelector(`[data-ec-tab="${saved}"]`)) {
        setActiveTab(saved);
        return;
      }
    } catch (_err) {
      /* ignore */
    }
    setActiveTab(DEFAULT_TAB);
  }

  function onTabActivated(tabId, session) {
    if (tabId === 'meta-connections') {
      window.EngageMetaConnections?.activate?.(session);
    } else {
      window.EngageMetaConnections?.deactivate?.();
    }
  }

  function activate(session) {
    active = true;
    currentSession = session || null;
    bindSubnav();
    restoreTab();
    onTabActivated(currentTab, currentSession);
  }

  function deactivate() {
    active = false;
    window.EngageMetaConnections?.deactivate?.();
  }

  window.EngageConfig = {
    activate,
    deactivate,
    isActive: () => active,
    getActiveTab: () => currentTab,
    setActiveTab,
  };
})();
