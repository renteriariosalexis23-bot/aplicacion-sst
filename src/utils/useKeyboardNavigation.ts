import { useEffect } from 'react';

export const useKeyboardNavigation = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Global Shortcuts
      
      // Ctrl + S: Guardar (Save) - Intercept prevent default if in form, click submit
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveBtn = buttons.find(b => ['guardar', 'registrar', 'actualizar'].some(text => b.textContent?.toLowerCase().includes(text)));
        if (saveBtn) saveBtn.click();
        return;
      }

      // Ctrl + Enter: Submit form quickly
      if (e.ctrlKey && e.key === 'Enter') {
        const target = e.target as HTMLElement;
        const form = target.closest('form');
        if (form) {
           e.preventDefault();
           const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
           if (submitBtn) submitBtn.click();
        } else {
            const buttons = Array.from(document.querySelectorAll('button'));
            const saveBtn = buttons.find(b => ['guardar', 'registrar', 'actualizar'].some(text => b.textContent?.toLowerCase().includes(text)));
            if (saveBtn) {
                e.preventDefault();
                saveBtn.click();
            }
        }
        return;
      }

      // Alt + N: Nuevo (New item)
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const buttons = Array.from(document.querySelectorAll('button'));
        const newBtn = buttons.find(b => ['nuevo', 'registrar', 'añadir', 'agregar'].some(text => b.textContent?.toLowerCase().includes(text)));
        if (newBtn && !newBtn.disabled) newBtn.click();
        return;
      }

      // Alt + B / Ctrl + / : Buscar (Search)
      if ((e.altKey && e.key.toLowerCase() === 'b') || (e.ctrlKey && e.key === '/')) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Buscar"], input[placeholder*="buscar"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Alt + E: Exportar (Export to Excel)
      if (e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const buttons = Array.from(document.querySelectorAll('button'));
        const exportBtn = buttons.find(b => b.textContent?.toLowerCase().includes('excel') || b.textContent?.toLowerCase().includes('exportar'));
        if (exportBtn && !exportBtn.disabled) exportBtn.click();
        return;
      }

      // Escape: Cerrar modales (Close modals)
      if (e.key === 'Escape') {
        const buttons = Array.from(document.querySelectorAll('button'));
        const cancelBtn = buttons.find(b => ['cancelar', 'cerrar'].some(text => b.textContent?.toLowerCase() === text) || b.getAttribute('aria-label') === 'Cerrar');
        if (cancelBtn) cancelBtn.click();
      }

      // 2. Arrow Key Navigation between inputs
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

      const target = e.target as HTMLElement;

      // Only operate on inputs, selects, textareas
      if (
        target.tagName !== 'INPUT' && 
        target.tagName !== 'SELECT' && 
        target.tagName !== 'TEXTAREA'
      ) {
        return;
      }

      // Skip generic disabled fields
      if ((target as HTMLInputElement).disabled) return;

      // Ensure that left/right in a text input don't get hijacked unless cursor is at boundary
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (target.tagName === 'INPUT') {
          const type = (target as HTMLInputElement).type;
          // types that support selectionStart/End
          if (['text', 'password', 'search', 'tel', 'url'].includes(type)) {
            const inputTarget = target as HTMLInputElement;
            if (e.key === 'ArrowLeft' && inputTarget.selectionStart !== 0) {
              return; // let native text navigation happen
            }
            if (e.key === 'ArrowRight' && inputTarget.selectionEnd !== inputTarget.value.length) {
              return; // let native text navigation happen
            }
          }
        } else if (target.tagName === 'TEXTAREA') {
            return; // don't mess with textarea left/right
        } else if (target.tagName === 'SELECT') {
            // Select elements do not use cursor text navigation, so we can intercept Left/Right.
            // Some browsers use Left/Right to change options in a select dropdown, so we might want to return, but let's allow it to move focus as requested.
        }
      }

      // ArrowUp/Down inside textarea should just navigate lines
      if (target.tagName === 'TEXTAREA' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          return;
      }
      
      // ArrowUp/Down inside select changes options natively
      if (target.tagName === 'SELECT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          return; 
      }

      // Collect all inputs we can easily navigate (focusable form fields)
      const form = target.closest('form') || target.closest('.modal-content') || document.body;
      const inputs = Array.from(
        form.querySelectorAll('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')
      ) as HTMLElement[];

      const currentIndex = inputs.indexOf(target);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        nextIndex = currentIndex + 1;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        nextIndex = currentIndex - 1;
      }

      if (nextIndex >= 0 && nextIndex < inputs.length && nextIndex !== currentIndex) {
        e.preventDefault();
        inputs[nextIndex].focus();
        
        // Select text if it's an input
        if (inputs[nextIndex].tagName === 'INPUT') {
          const nextInput = inputs[nextIndex] as HTMLInputElement;
          const type = nextInput.type;
          if (['text', 'password', 'search', 'tel', 'url', 'number'].includes(type)) {
            try {
              nextInput.select();
            } catch(e) {
                // Ignore select error on types that don't support it
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
