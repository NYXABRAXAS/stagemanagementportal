import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import type { Product, Role, VersionTree } from './types';

const LS_KEY = 'lsp.product';

export function useProducts() {
  return useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/roles') });
}

/** Selected product, synced to ?product= and remembered between pages. */
export function useSelectedProduct() {
  const [params, setParams] = useSearchParams();
  const products = useProducts();
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LS_KEY);
  } catch {
    stored = null;
  }
  const id = params.get('product') ?? stored ?? undefined;
  const list = products.data ?? [];
  const product = list.find((p) => p.id === id) ?? list[0];

  useEffect(() => {
    if (product && params.get('product') !== product.id) {
      const next = new URLSearchParams(params);
      next.set('product', product.id);
      setParams(next, { replace: true });
    }
  }, [product, params, setParams]);

  const select = (pid: string) => {
    try {
      localStorage.setItem(LS_KEY, pid);
    } catch {
      /* ignore */
    }
    const next = new URLSearchParams();
    next.set('product', pid);
    setParams(next);
  };
  return { products: list, product, select, loading: products.isLoading };
}

/**
 * The version to work on for a product: the open draft/submitted/approved version if there is
 * one, otherwise the latest published. An explicit ?version= overrides (read-only history view).
 */
export function useWorkingVersion(product?: Product) {
  const [params] = useSearchParams();
  const { can } = useAuth();
  const explicit = params.get('version');
  const versionId = explicit ?? product?.openVersion?.id ?? product?.published?.id ?? undefined;
  const tree = useQuery({
    queryKey: ['tree', versionId],
    queryFn: () => api.get<VersionTree>(`/versions/${versionId}/tree`),
    enabled: !!versionId,
  });
  const editable = useMemo(() => tree.data?.status === 'DRAFT' && can('config.edit'), [tree.data, can]);
  return { versionId, tree, editable, explicit: !!explicit };
}
