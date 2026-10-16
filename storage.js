/* ============================================================
   Persistence via localStorage.
   ============================================================ */

const Storage = {
  KEY: 'pdm_project_v2',

  save(state) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Save failed', e);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  clear() {
    localStorage.removeItem(this.KEY);
  }
};