import { writable, derived } from 'svelte/store';
import { isLlmOnlyFormat } from '$lib/huggingface/parser';

export interface CartModel {
  // local DB model — id is set, hf_model_id etc from DB
  id?: string;
  hf_model_id: string;
  file_path: string;
  data_type: string;
  runtime: 'onnx' | 'litert' | 'llm';
  task?: string;
  size_bytes?: number;
}

const STORAGE_KEY = 'cart_models';

// Reject .litertlm and .task — LLM benchmark runtime is not yet implemented.
// Keep messaging consistent with HFSearch / HFUrlImport / browse / custom.
function isBlocked(model: { file_path: string }): boolean {
  return isLlmOnlyFormat(model.file_path);
}

function loadFromStorage(): CartModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const all = JSON.parse(raw) as CartModel[];
      // Evict any items that match the LLM-only block list. Older sessions may
      // have stashed .litertlm entries before this constraint existed.
      return all.filter((m) => !isBlocked(m));
    }
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

    add(model: CartModel): boolean {
      if (isBlocked(model)) {
        console.warn(`[cart] Refused to add LLM-only model "${model.file_path}". Coming soon.`);
        return false;
      }
      let added = false;
      update((models) => {
        const key = `${model.hf_model_id}::${model.file_path}`;
        if (models.some((m) => `${m.hf_model_id}::${m.file_path}` === key)) return models;
        added = true;
        const next = [...models, model];
        saveToStorage(next);
        return next;
      });
      return added;
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

    toggle(model: CartModel): boolean {
      const key = `${model.hf_model_id}::${model.file_path}`;
      let willBeInCart = false;
      let blocked = false;
      update((models) => {
        const exists = models.some((m) => `${m.hf_model_id}::${m.file_path}` === key);
        if (!exists && isBlocked(model)) {
          console.warn(`[cart] Refused to add LLM-only model "${model.file_path}". Coming soon.`);
          blocked = true;
          return models;
        }
        willBeInCart = !exists;
        const next = exists
          ? models.filter((m) => `${m.hf_model_id}::${m.file_path}` !== key)
          : [...models, model];
        saveToStorage(next);
        return next;
      });
      return blocked ? false : willBeInCart;
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

// Re-exported so UI components don't have to import parser separately just to
// know whether a file path is blocked. Keep one source of truth.
export const isCartBlocked = isLlmOnlyFormat;
export const CART_BLOCKED_TOOLTIP = "LLM benchmark in development. You can view this model, but it can't be added to the cart or run yet.";
