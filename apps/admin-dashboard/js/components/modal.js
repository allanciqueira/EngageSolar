(function () {
  function createModalController(backdropElement) {
    if (!backdropElement) {
      return {
        open() {},
        close() {},
        isOpen() { return false; },
      };
    }

    function open() {
      backdropElement.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    function close() {
      backdropElement.hidden = true;
      document.body.style.removeProperty('overflow');
    }

    function isOpen() {
      return !backdropElement.hidden;
    }

    backdropElement.addEventListener('click', (event) => {
      if (event.target === backdropElement) {
        close();
      }
    });

    return { open, close, isOpen };
  }

  window.ReservaAiModal = { createModalController };
})();
