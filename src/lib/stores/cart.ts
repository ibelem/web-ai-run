import { writable, derived } from 'svelte/store';

export interface CartModel {
  // local DB model — id is set, hf_model_id etc from DB
  id?: string;
  hf_model_id: string;
  file_path: string;
  data_type: string;
  runtime: 'onnx' | 'litert';
  task?: string;
}

const STORAGE_KEY = 'cart_models';

function loadFromStorage(): CartModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CartModel[];
  } catch {}
  return [];
}

function saveToStorage(models: CartModel[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch {}
}

function createCartStore() {
  const { subscribe, update, set } = writable<CartModel[]>([]);

  return {
    subscribe,

    init() {
      set(loadFromStorage());
    },

    add(model: CartModel) {
      update((models) => {
        const key = `${model.hf_model_id}::${model.file_path}`;
        if (models.some((m) => `${m.hf_model_id}::${m.file_path}` === key)) return models;
        const next = [...models, model];
        saveToStorage(next);
        return next;
      });
    },

    remove(hf_model_id: string, file_path: string) {
      update((models) => {
        const next = models.filter(
          (m) => !(m.hf_model_id === hf_model_id && m.file_path === file_path)
        );
        saveToStorage(next);
        return next;
      });
    },

    removeById(id: string) {
      update((models) => {
        const next = models.filter((m) => m.id !== id);
        saveToStorage(next);
        return next;
      });
    },

    toggle(model: CartModel) {
      update((models) => {
        const key = `${model.hf_model_id}::${model.file_path}`;
        const exists = models.some((m) => `${m.hf_model_id}::${m.file_path}` === key);
        const next = exists
          ? models.filter((m) => `${m.hf_model_id}::${m.file_path}` !== key)
          : [...models, model];
        saveToStorage(next);
        return next;
      });
    },

    has(hf_model_id: string, file_path: string): boolean {
      // synchronous check not possible with writable — use derived or get()
      let result = false;
      const unsub = subscribe((models) => {
        result = models.some((m) => m.hf_model_id === hf_model_id && m.file_path === file_path);
      });
      unsub();
      return result;
    },

    clear() {
      set([]);
      saveToStorage([]);
    },
  };
}

export const cart = createCartStore();
export const cartCount = derived(cart, ($cart) => $cart.length);
