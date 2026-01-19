import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiSearch, FiChevronUp, FiChevronDown, FiSliders, FiTrash2 } from "react-icons/fi";
import ConfirmDialog from "../components/ConfirmDialog";
import NotificationsButton from "../components/NotificationsButton";
import Dropdown from "../components/Dropdown";
import LoadingSpinner from "../components/LoadingSpinner";
import CurrencyField from "../components/CurrencyField";
import useProducts from "../hooks/useProducts";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import Pagination from "../components/Pagination";
import { useAuth } from "../context/AuthContext";
import productService from "../services/productService";
import "../styles/VendorProducts.css";

const VendorProducts = () => {
  const { user, role } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    price: "",
    description: "",
    image: null,
    category: "",
    available: true,
    attributeGroups: []
  });
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState(null);

  // `loadProducts` removed — actual fetching handled by `useProducts` hook

  // Use hook for products data and filters (send vendor as logged-in vendor)
  const initialParams = { limit: 12, vendor: user._id || user.id };
  const {
    products: fetchedProducts,
    loading: fetchedLoading,
    error: fetchedError,
    pagination,
    filterOptions,
    params,
    setSearch,
    setCategory,
    setPriceRange,
    setSort,
    setPage,
    setMinRating,
    
    refresh,
  } = useProducts(initialParams);

  useEffect(() => {
    // keep local state in sync when hook updates
    setProducts(fetchedProducts || []);
    setLoading(!!fetchedLoading);
    setError(fetchedError ? (fetchedError.message || String(fetchedError)) : null);
  }, [fetchedProducts, fetchedLoading, fetchedError]);

  // Local UI filter state mirroring StorePage
  const [searchInput, setSearchInput] = useState(params.search || '');
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const cat = params.category;
    if (!cat || cat === 'All') return [];
    return cat.split(',').map(c => c.trim());
  });
  const [priceRangeModalOpen, setPriceRangeModalOpen] = useState(false);
  const [localMinPrice, setLocalMinPrice] = useState(() => params.minPrice !== undefined ? String(params.minPrice) : '');
  const [localMaxPrice, setLocalMaxPrice] = useState(() => params.maxPrice !== undefined ? String(params.maxPrice) : '');
  const [minRatingLocal, setMinRatingLocal] = useState(() => params.minRating !== undefined ? params.minRating : null);
  const [sortByLocal, setSortByLocal] = useState(params.sort || '');
  const [priceSort, setPriceSort] = useState(() => {
    if (params.sort === 'price_asc') return 'asc';
    if (params.sort === 'price_desc') return 'desc';
    return null;
  });

  // Debounce search input into hook
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput, setSearch]);

  // Sync selected categories to hook
  useEffect(() => {
    const same = (params.category || 'All') === (selectedCategories.length === 0 ? 'All' : (selectedCategories.length === 1 ? selectedCategories[0] : selectedCategories.join(',')));
    if (same) return;
    if (selectedCategories.length === 0) setCategory('All');
    else if (selectedCategories.length === 1) setCategory(selectedCategories[0]);
    else setCategory(selectedCategories.join(','));
  }, [selectedCategories, setCategory, params.category]);

  // Price range apply/clear
  const applyPriceRange = () => {
    const min = localMinPrice ? Number(localMinPrice) : undefined;
    const max = localMaxPrice ? Number(localMaxPrice) : undefined;
    setPriceRange(min, max);
    setPriceRangeModalOpen(false);
  };
  const clearPriceRange = () => {
    setLocalMinPrice('');
    setLocalMaxPrice('');
    setPriceRange(undefined, undefined);
    setPriceRangeModalOpen(false);
  };

  // Rating change
  useEffect(() => {
    setMinRating(minRatingLocal !== undefined ? minRatingLocal : null);
  }, [minRatingLocal, setMinRating]);

  // Sort change
  const handleSortChange = (newSort) => {
    setSort(newSort);
    setSortByLocal(newSort);
    if (newSort === 'price_asc') setPriceSort('asc');
    else if (newSort === 'price_desc') setPriceSort('desc');
    else setPriceSort(null);
  };

  const handlePriceSortToggle = () => {
    if (priceSort === null) {
      setPriceSort('asc');
      setSort('price_asc');
      setSortByLocal('price_asc');
    } else if (priceSort === 'asc') {
      setPriceSort('desc');
      setSort('price_desc');
      setSortByLocal('price_desc');
    } else {
      setPriceSort(null);
      setSort('');
      setSortByLocal('');
    }
  };

  const handleChange = (e) => {
    const { name, value, files, type, checked } = e.target;
    if (name === "image") {
      setForm((f) => ({ ...f, image: files[0] }));
    } else if (type === "checkbox") {
      setForm((f) => ({ ...f, [name]: checked }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  // Attribute groups management helpers
  const addAttributeGroup = () => {
    setForm(f => ({ ...f, attributeGroups: [ ...(f.attributeGroups || []), { key: '', title: '', type: 'single-select', optional: false, requiredMin: 0, attributes: [] } ] }));
  };

  const updateAttributeGroup = (idx, patch) => {
    setForm(f => {
      const ag = Array.isArray(f.attributeGroups) ? JSON.parse(JSON.stringify(f.attributeGroups)) : [];
      const group = ag[idx] || { attributes: [] };
      const prevType = group.type || 'single-select';
      const prevOptional = !!group.optional;
      // apply patch
      const newGroup = { ...group, ...patch };

      // If group became optional, clear any defaultSelected flags and remove requiredMin
      if (!prevOptional && newGroup.optional) {
        if (Array.isArray(newGroup.attributes)) {
          for (const a of newGroup.attributes) {
            if (a && typeof a === 'object') a.defaultSelected = false;
          }
        }
        if (Object.prototype.hasOwnProperty.call(newGroup, 'requiredMin')) delete newGroup.requiredMin;
      }

      // If group switched to single-select, ensure at most one defaultSelected remains
      if ((patch.type && patch.type === 'single-select') || (prevType !== 'single-select' && newGroup.type === 'single-select')) {
        if (Array.isArray(newGroup.attributes)) {
          const defs = newGroup.attributes.filter(a => a && a.defaultSelected);
          if (defs.length > 1) {
            // keep first default, unset rest
            let kept = false;
            for (const a of newGroup.attributes) {
              if (a && a.defaultSelected) {
                if (!kept) kept = true;
                else a.defaultSelected = false;
              }
            }
          }
          // Do NOT auto-select a default when switching types. Vendors must explicitly choose defaults.
          // If single-select is optional, ensure no defaults (optional groups should never have defaults)
          if (newGroup.optional) {
            for (const a of newGroup.attributes) if (a && a.defaultSelected) a.defaultSelected = false;
          }
        }
      }

      ag[idx] = newGroup;
      return { ...f, attributeGroups: ag };
    });
  };

  const removeAttributeGroup = (idx) => {
    setForm(f => {
      const ag = Array.isArray(f.attributeGroups) ? [...f.attributeGroups] : [];
      ag.splice(idx, 1);
      return { ...f, attributeGroups: ag };
    });
  };

  const addTimestampsRef = React.useRef({});
  const modalErrorRef = React.useRef(null);
  const modalContentRef = React.useRef(null);

  const addAttributeToGroup = (gIdx) => {
    const now = Date.now();
    const last = addTimestampsRef.current[gIdx] || 0;
    // debounce duplicate rapid calls (e.g., accidental double-invoke)
    if (now - last < 400) return;
    addTimestampsRef.current[gIdx] = now;

    setForm(f => {
      const ag = Array.isArray(f.attributeGroups) ? [...f.attributeGroups] : [];
      const group = ag[gIdx] || { attributes: [] };
      const attrs = Array.isArray(group.attributes) ? [...group.attributes] : [];
      const lastAttr = attrs[attrs.length - 1];
      // If last attribute is an untouched placeholder, avoid adding another duplicate
      if (lastAttr && !lastAttr.name && lastAttr.priceType === 'flat' && Number(lastAttr.amount) === 0 && !lastAttr.quantityEnabled && !lastAttr.defaultSelected) {
        return { ...f, attributeGroups: ag };
      }
      const newAttr = { name: '', priceType: 'flat', amount: 0, quantityEnabled: false, defaultSelected: false };
      group.attributes = [...attrs, newAttr];
      ag[gIdx] = group;
      return { ...f, attributeGroups: ag };
    });
  };

  const updateAttribute = (gIdx, aIdx, patch) => {
    setForm(f => {
      const ag = Array.isArray(f.attributeGroups) ? [...f.attributeGroups] : [];
      const group = ag[gIdx] || { attributes: [] };
      const attrs = [...(group.attributes || [])];
      // If setting defaultSelected on a single-select group, unset others
      if (patch && patch.defaultSelected && group.type === 'single-select') {
        for (let i = 0; i < attrs.length; i++) {
          attrs[i] = { ...(attrs[i] || {}), defaultSelected: false };
        }
      }
      // Merge patch but enforce: attributes with amount > 0 cannot be defaultSelected
      const existing = attrs[aIdx] || {};
      const merged = { ...existing, ...patch };
      const amt = Number(typeof merged.amount !== 'undefined' ? merged.amount : existing.amount || 0);
      if (amt > 0 && merged.defaultSelected) {
        // clear attempted default selection when amount is positive
        merged.defaultSelected = false;
      }
      // If changing amount to positive and attribute was previously defaultSelected, clear it
      if (typeof patch.amount !== 'undefined' && Number(patch.amount) > 0 && existing.defaultSelected) {
        merged.defaultSelected = false;
      }

      attrs[aIdx] = merged;
      group.attributes = attrs;
      ag[gIdx] = group;
      return { ...f, attributeGroups: ag };
    });
  };

  const removeAttribute = (gIdx, aIdx) => {
    setForm(f => {
      const ag = Array.isArray(f.attributeGroups) ? JSON.parse(JSON.stringify(f.attributeGroups)) : [];
      const group = ag[gIdx] || { attributes: [] };
      group.attributes = group.attributes || [];
      group.attributes.splice(aIdx, 1);

      // If this is the Size group and there are no attributes left, auto-add the Regular option
      if (isSizeGroup(group) && group.attributes.length === 0) {
        group.attributes.push({ name: 'Regular', priceType: 'flat', amount: 0, quantityEnabled: false, defaultSelected: true });
      }

      ag[gIdx] = group;
      return { ...f, attributeGroups: ag };
    });
  };

  const handleEdit = (p) => {
    setEditing(p);
    // Ensure the size attribute group is present when editing so it's visible in the modal
    const ags = p.attributeGroups ? JSON.parse(JSON.stringify(p.attributeGroups)) : [];
    const hasSize = ags.some(g => (g.key && String(g.key).toLowerCase() === 'size') || (g.title && String(g.title).toLowerCase() === 'size'));
    if (!hasSize) {
      ags.unshift({ key: 'size', title: 'Size', type: 'single-select', optional: false, requiredMin: 1, attributes: [ { name: 'Regular', priceType: 'flat', amount: 0, quantityEnabled: false, defaultSelected: true } ], _isSizeLocked: true });
    } else {
      // mark any existing size group as locked so UI treats it as the canonical Size group
      for (let i = 0; i < ags.length; i++) {
        const g = ags[i];
        if ((g.key && String(g.key).toLowerCase() === 'size') || (g.title && String(g.title).toLowerCase() === 'size')) {
          g._isSizeLocked = true;
        }
      }
    }

    // clear any prior errors when opening an edit modal
    setModalError(null);
    setError(null);

    setForm({
      name: p.name || "",
      price: typeof p.price === 'number' ? String(p.price) : (p.price || ""),
      description: p.description || "",
      image: null,
      category: p.category || "",
      available: typeof p.available === "boolean" ? p.available : true,
      attributeGroups: ags
    });
    setShowModal(true);
  };

  const handleCancel = () => {
    setEditing(null);
    // clear form and any visible errors when cancelling the modal
    setForm({ name: "", price: "", description: "", image: null, category: "", available: true });
    setModalError(null);
    setError(null);
    setShowModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Prevent duplicate submits
    if (loading) return;
    setLoading(true);
    setError(null);
    setModalError(null);
    // basic validation: require name, price, description, category
    const missing = [];
    if (!form.name || !String(form.name).trim()) missing.push('Name is required');
    if (!form.description || !String(form.description).trim()) missing.push('Description is required');
    if (form.price === '' || form.price == null || Number.isNaN(Number(form.price))) missing.push('Valid price is required');
    if (!form.category || !String(form.category).trim()) missing.push('Valid category is required');
    if (missing.length > 0) {
      // show only the first message on the FE
      setError(missing[0]);
      setLoading(false);
      return;
    }
    // ensure price is a valid non-negative number
    const numericPrice = Number(form.price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      setError('Valid price is required');
      setLoading(false);
      return;
    }
    // Client-side validation for attributeGroups
    const validateAttributeGroups = (ags) => {
      const errors = [];
      if (!Array.isArray(ags)) return errors;
      // Ensure size group exists
      const hasSize = ags.some(g => (g.key && String(g.key).toLowerCase() === 'size') || (g.title && String(g.title).toLowerCase() === 'size'));
      if (!hasSize) errors.push('A required "Size" group must be present (the server will add one automatically if missing).');
      // Ensure group keys and titles are unique
      const seenKeys = {};
      const seenTitles = {};
      for (const g of ags) {
        const keyNorm = (g.key || '').toString().trim().toLowerCase();
        const titleNorm = (g.title || '').toString().trim().toLowerCase();
        if (keyNorm) {
          if (seenKeys[keyNorm]) errors.push(`Duplicate attribute group key "${g.key}" found. Group keys must be unique.`);
          seenKeys[keyNorm] = true;
        }
        // Validate snake_case for keys when provided
        if (g.key && typeof g.key === 'string') {
          const k = g.key.trim();
          const snakeRe = /^[a-z][a-z0-9_]*$/;
          if (!snakeRe.test(k)) {
            errors.push(`Attribute group key "${g.key}" must be snake_case: lowercase letters, numbers and underscores only, starting with a letter (e.g. size, spice_level).`);
          }
        }
        if (titleNorm) {
          if (seenTitles[titleNorm]) errors.push(`Duplicate attribute group title "${g.title}" found. Group titles must be unique.`);
          seenTitles[titleNorm] = true;
        }
      }
      for (const g of ags) {
        if (!g.title && !g.key) errors.push('Each attribute group needs a title or key.');
        // Require a default selection for single-select groups only when the group is not optional
        if (g.type === 'single-select' && !g.optional) {
          const defs = (g.attributes || []).filter(a => a.defaultSelected);
          if (!defs || defs.length === 0) errors.push(`Single-select group "${g.title || g.key}" must have a default selection.`);
        }

        // For non-optional multi-select groups, requiredMin must be a positive integer
        // and the number of defaultSelected attributes must equal requiredMin exactly.
        if (g.type === 'multi-select' && !g.optional) {
          const defs = (g.attributes || []).filter(a => a.defaultSelected);
          const rm = Number.isFinite(Number(g.requiredMin)) ? Number(g.requiredMin) : NaN;
          if (!Number.isInteger(rm) || rm < 1) {
            errors.push(`Group "${g.title || g.key}" must have a valid Min required (positive integer).`);
          } else if (defs.length !== rm) {
            errors.push(`Group "${g.title || g.key}" requires exactly ${rm} default selection(s), but ${defs.length} are set.`);
          }
        }
        // Mandatory (non-optional) groups must have at least one default attribute selected
        if (!g.optional) {
          const defsMandatory = (g.attributes || []).filter(a => a.defaultSelected);
          if (!defsMandatory || defsMandatory.length === 0) errors.push(`Mandatory group "${g.title || g.key}" must have at least one default attribute selected.`);
        }
        // For Size group require at least one zero-amount option (Regular)
        if (isSizeGroup(g)) {
          const hasZero = (g.attributes || []).some(a => Number(a.amount) === 0);
          if (!hasZero) errors.push(`Size group "${g.title || g.key}" must include at least one option with amount 0 (e.g. Regular).`);
          if ((g.type || 'single-select') !== 'single-select') errors.push('The Size group must be single-select.');
        }
        const names = new Set();
        for (const a of (g.attributes || [])) {
          if (typeof a.amount === 'undefined' || a.amount === '' || a.amount == null) errors.push(`Attribute "${a.name || 'unnamed'}" in group "${g.title || g.key}" must have an amount.`);
          // Ensure attribute names within a group are unique (use local set, don't mutate group)
          const an = (a.name || '').toString().trim().toLowerCase();
          if (an) {
            if (names.has(an)) errors.push(`Duplicate attribute name "${a.name}" found in group "${g.title || g.key}". Attribute names must be unique within a group.`);
            names.add(an);
          }
          // Only disallow negative amounts for non-Size groups. Size group may have negative adjustments when vendor chooses minus types or negative amounts.
          if (!isSizeGroup(g) && Number(a.amount) < 0) errors.push(`Attribute "${a.name || 'unnamed'}" cannot have negative amount (only Size attributes may be negative).`);
          // Vendors may not mark an attribute as default if it has a positive (non-zero) amount
          if (a.defaultSelected && Number(a.amount) > 0) errors.push(`Attribute "${a.name || 'unnamed'}" cannot be default when amount is non-zero.`);
          const pt = String(a.priceType || '').toLowerCase();
          if ((pt === 'percent' || pt === 'minus-percent') && (Number(a.amount) < 0 || Number(a.amount) > 100)) errors.push(`Percent attribute "${a.name || 'unnamed'}" must be between 0 and 100.`);
        }
      }
      return errors;
    };

    const clientErrors = validateAttributeGroups(form.attributeGroups);
    if (clientErrors.length > 0) {
      // Log structured validation info for easier debugging
      logAttributeValidation(clientErrors, form.attributeGroups);
      // show only the first attribute error to the user
      setModalError(clientErrors[0]);
      setLoading(false);
      return;
    }

    // Final guard: re-run client-side validation to ensure we don't send if any errors remain
    const finalMissing = [];
    if (!form.name || !String(form.name).trim()) finalMissing.push('Name is required');
    if (!form.description || !String(form.description).trim()) finalMissing.push('Description is required');
    if (form.price === '' || form.price == null || Number.isNaN(Number(form.price))) finalMissing.push('Valid price is required');
    if (!form.category || !String(form.category).trim()) finalMissing.push('Valid category is required');
    const finalClientErrors = validateAttributeGroups(form.attributeGroups);
    if (finalMissing.length > 0) {
      setError(finalMissing[0]);
      setLoading(false);
      return;
    }
    if (finalClientErrors.length > 0) {
      logAttributeValidation(finalClientErrors, form.attributeGroups);
      setModalError(finalClientErrors[0]);
      setLoading(false);
      return;
    }

    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("price", numericPrice);
      fd.append("description", form.description);
      fd.append("category", form.category);
      if (form.image) fd.append("image", form.image);
      // include availability (server expects boolean, send as string)
      fd.append("available", form.available ? "true" : "false");
      // include attributeGroups if present; ensure required `size` group exists
        try {
        const ag = Array.isArray(form.attributeGroups) ? JSON.parse(JSON.stringify(form.attributeGroups)) : [];
        const hasSize = ag.some(g => (g.key && String(g.key).toLowerCase() === 'size') || (g.title && String(g.title).toLowerCase() === 'size'));
        if (!hasSize) {
          ag.unshift({ key: 'size', title: 'Size', type: 'single-select', optional: false, requiredMin: 1, attributes: [ { name: 'Regular', priceType: 'flat', amount: 0, quantityEnabled: false, defaultSelected: true } ] });
        } else {
          // Sanitize groups according to current UI state before sending:
          // - If a group is optional, clear any defaultSelected flags and remove requiredMin
          // - Do NOT auto-set defaults for non-optional single-select groups; require vendor action
          for (const g of ag) {
            if (!g || typeof g !== 'object') continue;
            if (g.optional) {
              // clear defaults for optional groups so hidden UI state doesn't leak
              if (Array.isArray(g.attributes)) {
                for (const a of g.attributes) {
                  if (a && typeof a === 'object') a.defaultSelected = false;
                }
              }
              // optional groups should not send a requiredMin constraint
              if (Object.prototype.hasOwnProperty.call(g, 'requiredMin')) delete g.requiredMin;
            } else {
              // non-optional groups: do not auto-select defaults here; server will validate presence of defaults
              if (g.type === 'single-select') {
                // Ensure only one defaultSelected remains if vendor explicitly set multiple
                const defs = (g.attributes || []).filter(a => a && a.defaultSelected);
                if (defs.length > 1) {
                  let kept = false;
                  for (const a of g.attributes) {
                    if (a && a.defaultSelected) {
                      if (!kept) kept = true;
                      else a.defaultSelected = false;
                    }
                  }
                }
              }
            }
          }
        }
        // Strip internal UI-only flags (any _prefixed keys) before sending to server
        for (const g of ag) {
          if (g && typeof g === 'object') {
            for (const k of Object.keys(g)) {
              if (k && String(k).startsWith('_')) delete g[k];
            }
          }
        }
        fd.append('attributeGroups', JSON.stringify(ag));
      } catch (err) {
        // ignore stringify errors; backend will validate
      }

      if (editing) {
        await productService.updateProduct(editing._id || editing.id, fd);
      } else {
        await productService.createProduct(fd);
      }

      await refresh();
      handleCancel();
      setShowModal(false);
      setModalError(null);
    } catch (err) {
      const fullMsg = err?.response?.data?.message || err?.message || "Save failed";
      // Log the full error and payload for debugging
      logSaveError(err, { name: form.name, price: numericPrice, attributeGroups: form.attributeGroups });
      // Show only the first part of any comma-separated server message to the user
      try {
        const first = String(fullMsg).split(',')[0].trim();
        setModalError(first || 'Save failed');
      } catch (e) {
        setModalError('Save failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const handleDelete = async (id) => {
    // open confirm dialog
    setConfirmTarget(id);
    setConfirmOpen(true);
  };

  const doDeleteConfirmed = async () => {
    if (!confirmTarget) return;
    setConfirmOpen(false);
    setLoading(true);
    try {
      await productService.deleteProduct(confirmTarget);
      await refresh();
    } catch (err) {
      setError(err?.message || "Delete failed");
    } finally {
      setLoading(false);
      setConfirmTarget(null);
    }
  };

  const navigate = useNavigate();

  const isSizeGroup = (g) => {
    if (!g) return false;
    const k = String(g.key || '').toLowerCase();
    const t = String(g.title || '').toLowerCase();
    return k === 'size' || t === 'size';
  };

  // Only treat a Size group as "locked" (immutable UI) when it was provided
  // by the server or when we intentionally injected the required Size group
  // for the Add Product flow. User-created groups that happen to be named
  // "size" should remain editable.
  const isSizeGroupLocked = (g) => {
    if (!isSizeGroup(g)) return false;
    return !!g._isSizeLocked;
  };

  // Drag & drop refs and handlers for reordering groups and attributes
  const dragItemRef = useRef(null);
  const dragTypeRef = useRef(null);

  const onAttributeDragStart = (e, gi, ai) => {
    dragTypeRef.current = 'attribute';
    dragItemRef.current = { gi, ai };
    // Prevent parent group drag from activating
    try { e.stopPropagation(); } catch (_) {}
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'attribute', gi, ai })); } catch (_) {}
  };

  const onGroupDragStart = (e, gi) => {
    dragTypeRef.current = 'group';
    dragItemRef.current = { gi };
    try { e.stopPropagation(); } catch (_) {}
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'group', gi })); } catch (_) {}
  };

  const onDragOver = (e) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
  };

  const onAttributeDrop = (e, targetGi, targetAi) => {
    e.preventDefault();
    if (!dragItemRef.current || !dragTypeRef.current) return;
    if (dragTypeRef.current === 'attribute') {
      const { gi: srcGi, ai: srcAi } = dragItemRef.current;
      setForm(f => {
        const ag = Array.isArray(f.attributeGroups) ? JSON.parse(JSON.stringify(f.attributeGroups)) : [];
        if (!ag[srcGi] || !ag[targetGi]) return f;
        const srcAttrs = ag[srcGi].attributes || [];
        const tgtAttrs = ag[targetGi].attributes || [];
        const [moved] = srcAttrs.splice(srcAi, 1);
        // If moving within same group, adjust target index when needed
        let insertIndex = Math.min(targetAi, tgtAttrs.length);
        if (srcGi === targetGi && srcAi < targetAi) insertIndex = Math.max(0, insertIndex - 1);
        tgtAttrs.splice(insertIndex, 0, moved);
        ag[srcGi].attributes = srcAttrs;
        ag[targetGi].attributes = tgtAttrs;
        return { ...f, attributeGroups: ag };
      });
    } else if (dragTypeRef.current === 'group') {
      const { gi: srcGi } = dragItemRef.current;
      setForm(f => {
        const ag = Array.isArray(f.attributeGroups) ? JSON.parse(JSON.stringify(f.attributeGroups)) : [];
        if (srcGi == null || targetGi == null || !ag[srcGi]) return f;
        const [moved] = ag.splice(srcGi, 1);
        const insertIndex = Math.min(targetGi, ag.length);
        ag.splice(insertIndex, 0, moved);
        return { ...f, attributeGroups: ag };
      });
    }
    dragItemRef.current = null;
    dragTypeRef.current = null;
  };

  const onDragEnd = () => {
    dragItemRef.current = null;
    dragTypeRef.current = null;
  };

  // Logging helpers for attribute validation and save errors
  const logAttributeValidation = (errors, ags) => {
    try {
      console.group && console.group('Attribute validation error');
      console.error('Validation errors:', errors);
      console.error('attributeGroups snapshot:', ags);
      console.error('Stack:', new Error().stack);
      console.groupEnd && console.groupEnd();
    } catch (e) { /* swallow logging errors */ }
  };

  const logSaveError = (err, payload) => {
    try {
      const info = {
        message: err?.message || 'Save error',
        status: err?.response?.status,
        responseData: err?.response?.data,
        payload
      };
      console.error('Product save failed:', info, 'stack:', err?.stack || new Error().stack);
    } catch (e) { /* swallow */ }
  };

  // Auto-scroll and focus to modal error when it appears
  useEffect(() => {
    if (!modalError) return;
    try {
      if (modalErrorRef.current && typeof modalErrorRef.current.scrollIntoView === 'function') {
        modalErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { modalErrorRef.current.focus({ preventScroll: true }); } catch (_) {}
      } else if (modalContentRef.current && typeof modalContentRef.current.scrollIntoView === 'function') {
        modalContentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {
      // ignore scrolling errors
    }
  }, [modalError]);

  return (
    <>
      <header className={`account-header ${role === 'vendor' ? 'center-logo' : ''}`}>
        <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
          <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
        </button>
        <h1>Vendor Products</h1>
        <div className="header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <NotificationsButton />
        </div>
      </header>

      <div className="page-container">
        {error && <div className="page-error">{error}</div>}

        {/* top actions removed - Add Product will live under filters */}

        {/* StorePage-style filter bar (search + filters) */}
        <div className="search-bar">
          <FiSearch size={20} color="#ADADAD" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button className="search-clear" onClick={() => setSearchInput('')}>
              <FiX size={16} />
            </button>
          )}
        </div>

        <div className="filter-bar">
          <div className="filter-row">
            <MultiSelectDropdown
              options={filterOptions.categories || []}
              selected={selectedCategories}
              onChange={setSelectedCategories}
              placeholder="Category"
              allOptionLabel="All Categories"
            />

            <button
              className={`filter-chip ${priceSort ? 'active' : ''}`}
              onClick={handlePriceSortToggle}
            >
              Price {priceSort ? (priceSort === 'asc' ? <FiChevronDown size={12} /> : <FiChevronUp size={12} />) : null}
            </button>

            <button
              className={`filter-chip ${(params.minPrice || params.maxPrice) ? 'active' : ''}`}
              onClick={() => setPriceRangeModalOpen(true)}
            >
              <FiSliders size={12} /> Price Range
              {(params.minPrice || params.maxPrice) && (
                <span className="filter-indicator" />
              )}
            </button>

            <Dropdown
              options={[
                { value: '', label: 'Any Rating' },
                { value: '4.5', label: '4.5+ ⭐' },
                { value: '4', label: '4+ ⭐' },
                { value: '3.5', label: '3.5+ ⭐' },
                { value: '3', label: '3+ ⭐' },
              ]}
              value={minRatingLocal ? String(minRatingLocal) : ''}
              onChange={(val) => setMinRatingLocal(val ? Number(val) : null)}
              placeholder="Any Rating"
              size="sm"
            />

            <Dropdown
              options={[
                { value: '', label: 'Sort By' },
                { value: 'newest', label: 'Newest' },
                { value: 'price_asc', label: 'Price: Low to High' },
                { value: 'price_desc', label: 'Price: High to Low' },
                { value: 'rating', label: 'Top Rated' },
              ]}
              value={sortByLocal}
              onChange={handleSortChange}
              placeholder="Sort By"
              size="sm"
            />
          </div>

          <div className="filter-actions">
            {(params.search || (params.category && params.category !== 'All') || params.minPrice || params.maxPrice || params.minRating) && (
              <button className="clear-filters-btn" onClick={() => { setSearchInput(''); setSelectedCategories([]); setLocalMinPrice(''); setLocalMaxPrice(''); setMinRatingLocal(null); setSort(''); }}>
                <FiX size={14} /> Clear Filters
              </button>
            )}

            <div style={{ marginLeft: 12 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  // Initialize a blank form with required Size attribute group for Add Product
                  setEditing(null);
                  setForm({
                    name: "",
                    price: "",
                    description: "",
                    image: null,
                    category: "",
                    available: true,
                    attributeGroups: [
                      {
                        key: 'size',
                        title: 'Size',
                        type: 'single-select',
                        optional: false,
                        requiredMin: 1,
                        attributes: [
                                { name: 'Regular', priceType: 'flat', amount: 0, quantityEnabled: false, defaultSelected: true }
                        ]
                              , _isSizeLocked: true
                      }
                    ]
                  });
                  setShowModal(true);
                }}
              >
                Add Product
              </button>
            </div>
          </div>
        </div>

        

        <div className="products-container">
          {priceRangeModalOpen && (
            <div className="modal-overlay" onClick={() => setPriceRangeModalOpen(false)}>
              <div className="price-range-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Set Price Range</h3>
                  <button className="modal-close" onClick={() => setPriceRangeModalOpen(false)}>
                    <FiX size={20} />
                  </button>
                </div>
                <div className="modal-content">
                  <div className="price-inputs">
                    <div className="price-input-group">
                      <label>Minimum Price</label>
                      <div className="price-input-wrapper">
                        <span className="currency">Rs</span>
                        <input
                          type="number"
                          placeholder={localMinPrice || '0'}
                          value={localMinPrice}
                          onChange={(e) => setLocalMinPrice(e.target.value)}
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="price-divider">to</div>
                    <div className="price-input-group">
                      <label>Maximum Price</label>
                      <div className="price-input-wrapper">
                        <span className="currency">Rs</span>
                        <input
                          type="number"
                          placeholder={localMaxPrice || '10000'}
                          value={localMaxPrice}
                          onChange={(e) => setLocalMaxPrice(e.target.value)}
                          min="0"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-actions" style={{ padding: 20, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => { clearPriceRange(); }}>Clear</button>
                  <button className="btn btn-primary" onClick={() => { applyPriceRange(); }}>Apply</button>
                </div>
              </div>
            </div>
          )}

          <div className="products-grid" style={{ position: 'relative' }}>
            {loading && (
              <div className="products-loading-overlay">
                <LoadingSpinner />
              </div>
            )}

            {!loading && products.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">🛍️</div>
                <h3>No products yet</h3>
              </div>
            )}

            {!loading && products.map((p) => (
              <div key={p._id || p.id} className="product-card">
                {p.image && (
                  <img src={p.image} alt={p.name} className="product-thumb" />
                )}
                <div className="product-body">
                  <h4>{p.name}</h4>
                  <p className="muted">{p.description}</p>
                  <div className="product-actions">
                    <strong>Rs. {Number(p.price ?? 0).toFixed(2)}</strong>
                    <div>
                        <button
                          className="btn btn-small btn-primary vp-action-edit"
                          onClick={() => handleEdit(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-small btn-danger vp-action-delete"
                          onClick={() => handleDelete(p._id || p.id)}
                        >
                          Delete
                        </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div style={{ marginTop: 18 }}>
              <Pagination page={pagination.page} pages={pagination.pages} onChange={(p) => setPage(p)} />
            </div>
          )}
        </div>
      </div>

      {showModal && (
            <div className="edit-profile-overlay vp-modal-overlay">
              <div className="edit-profile-modal vp-modal-wrapper" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                  <h2>{editing ? 'Edit product' : 'Add product'}</h2>
                  <button className="modal-close" onClick={handleCancel}>
                    <FiX size={20} />
                  </button>
                </div>
              <form id="vp-edit-form" onSubmit={handleSubmit}>
              <div className="edit-profile-modal-content vp-modal-body">
                  <div ref={modalContentRef}>
                {modalError && (
                  <div className="modal-error" role="alert">
                    {modalError}
                  </div>
                )}
                {modalError && (
                  <div ref={modalErrorRef} tabIndex={-1} style={{ outline: 'none' }} />
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <label className="vp-form-checkbox" style={{ margin: 0 }}>
                    <input type="checkbox" name="available" checked={!!form.available} onChange={handleChange} />
                    <span>Available</span>
                  </label>
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group price-input">
                  <CurrencyField
                    label="Price"
                    name="price"
                    id="price"
                    value={form.price}
                    onChange={handleChange}
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <Dropdown
                    options={
                      (filterOptions && Array.isArray(filterOptions.categories) && filterOptions.categories.length > 0)
                        ? filterOptions.categories.filter(c => String(c).toLowerCase() !== 'all')
                        : ['Beverages','Biryani','Burgers','Desserts','Japanese','Noodles','Pizzas','Salads','Sandwiches','Seafood','Sides','Wraps']
                    }
                    value={form.category}
                    onChange={(val) => setForm((f) => ({ ...f, category: val }))}
                    placeholder="Select category"
                  />
                </div>
                <div className="form-group">
                  <label>Image</label>
                  <input
                    type="file"
                    name="image"
                    accept="image/*"
                    onChange={handleChange}
                  />
                  {(editing && (editing.image || editing.imageUrl)) && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {editing.image || editing.imageUrl ? (
                        <img src={editing.image || editing.imageUrl} alt="Current" style={{ height: 40, width: 'auto', borderRadius: 4, objectFit: 'cover' }} onError={(e) => { try { e.target.style.display = 'none'; } catch (_) {} }} />
                      ) : null}
                      <div style={{ color: 'var(--text-dark, #333)', fontSize: 13 }}>
                        Existing image is saved for this product. Choose a new file to replace it.
                      </div>
                    </div>
                  )}
                </div>

                {/* Attribute Groups editor */}
                <div className="form-group">
                  <label>Attribute Groups</label>
                  <div className="attribute-groups">
                    {(form.attributeGroups || []).map((g, gi) => (
                      <div
                        key={gi}
                        className="attribute-group"
                        style={{ border: '1px solid #eee', padding: 8, marginBottom: 8 }}
                        onDragOver={onDragOver}
                        onDrop={(e) => onAttributeDrop(e, gi, (g.attributes || []).length)}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <div
                            className="group-drag-handle"
                            draggable
                            onDragStart={(e) => onGroupDragStart(e, gi)}
                            onDragEnd={onDragEnd}
                            style={{ cursor: 'grab', padding: '6px 8px', marginRight: 8 }}
                            aria-hidden
                          >
                            ☰
                          </div>
                          <div className="attribute-field-group">
                            <label>Key</label>
                            <input placeholder="Group key (e.g. size)" value={g.key || ''} onChange={(e) => updateAttributeGroup(gi, { key: e.target.value })} disabled={isSizeGroupLocked(g)} />
                          </div>
                          <div className="attribute-field-group">
                            <label>Title</label>
                            <input placeholder="Title (e.g. Size)" value={g.title || ''} onChange={(e) => updateAttributeGroup(gi, { title: e.target.value })} disabled={isSizeGroupLocked(g)} />
                          </div>
                          <div className="attribute-field-group">
                            <label>Type</label>
                            <Dropdown options={[{ value: 'single-select', label: 'Single-select' }, { value: 'multi-select', label: 'Multi-select' }]} value={g.type || 'single-select'} onChange={(val) => updateAttributeGroup(gi, { type: val })} disabled={isSizeGroupLocked(g)} />
                          </div>
                          { !isSizeGroupLocked(g) && (
                            <div className="attribute-field-group checkbox-field">
                              <label>Optional</label>
                              <label className="vp-form-checkbox" style={{ marginLeft: 8 }}>
                                <input type="checkbox" checked={!!g.optional} onChange={(e) => updateAttributeGroup(gi, { optional: !!e.target.checked })} />
                              </label>
                            </div>
                          )}
                          { (g.type === 'multi-select' && !g.optional) && (
                            <div className="attribute-field-group">
                              <label>Min required</label>
                              <input type="number" min={1} placeholder="Min required" value={g.requiredMin || 0} onChange={(e) => updateAttributeGroup(gi, { requiredMin: Number(e.target.value || 0) })} style={{ width: 100 }} />
                            </div>
                          )}
                          { !isSizeGroupLocked(g) && (
                            <button type="button" className="vp-group-delete" onClick={() => removeAttributeGroup(gi)} aria-label="Remove group">
                              <FiTrash2 size={16} />
                            </button>
                          )}
                        </div>
                        <div className="attributes-list">
                          {(g.attributes || []).map((a, ai) => {
                            const isSizeG = isSizeGroup(g);
                            const isRegular = isSizeG && String((a.name || '').toString()).toLowerCase() === 'regular';
                            const attrCount = (g.attributes || []).length;
                            const regularDeleteDisabled = isRegular && attrCount === 1;
                            const canDelete = !regularDeleteDisabled;
                            const basePrice = Number(form.price) || 0;
                            const amt = Number(a.amount || 0);
                            const pt = String(a.priceType || 'flat').toLowerCase();
                            let addonAmount = 0;
                            if (pt === 'percent') addonAmount = basePrice * (amt / 100);
                            else if (pt === 'minus-percent') addonAmount = - (basePrice * (amt / 100));
                            else if (pt === 'minus-flat') addonAmount = -amt;
                            else addonAmount = amt;
                            const previewValue = isSizeG ? (basePrice + addonAmount) : addonAmount;
                            const previewText = Number(previewValue) === 0 ? '0' : `Rs. ${previewValue.toFixed(2)}`;
                            return (
                              <div
                                          key={ai}
                                          className="attribute-row"
                                          style={{ display: 'flex', gap: 20, alignItems: 'center' }}
                                          onDragOver={onDragOver}
                                          onDrop={(e) => onAttributeDrop(e, gi, ai)}
                                        >
                                <div
                                  className="drag-handle"
                                  draggable
                                  onDragStart={(e) => onAttributeDragStart(e, gi, ai)}
                                  onDragEnd={onDragEnd}
                                  style={{ cursor: 'grab', padding: '6px 8px', display: 'flex', alignItems: 'center' }}
                                  aria-hidden
                                >
                                  ☰
                                </div>
                                <div className="attribute-field">
                                  <label>Attribute</label>
                                  <input placeholder="Attribute name" value={a.name || ''} onChange={(e) => updateAttribute(gi, ai, { name: e.target.value })} />
                                </div>
                                <div className="attribute-field" style={{ flex: '0 0 160px' }}>
                                  <label>Price type</label>
                                  <Dropdown options={[{ value: 'flat', label: 'Flat' }, { value: 'percent', label: 'Percent' }, { value: 'minus-flat', label: 'Minus (Flat)' }, { value: 'minus-percent', label: 'Minus (%)' }]} value={a.priceType || 'flat'} onChange={(val) => updateAttribute(gi, ai, { priceType: val })} disabled={regularDeleteDisabled} />
                                </div>
                                <div className="attribute-field" style={{ flex: '0 0 120px' }}>
                                  <label>Amount</label>
                                  <input type="number" step="0.01" min={isSizeG ? undefined : 0} placeholder="amount" value={a.amount || 0} onChange={(e) => updateAttribute(gi, ai, { amount: Number(e.target.value || 0) })} disabled={regularDeleteDisabled} />
                                </div>
                                { !isSizeG && (
                                  <div className="attribute-field checkbox-field vertical">
                                    <div className="checkbox-top-label">Qty</div>
                                    <label className="vp-form-checkbox">
                                      <input type="checkbox" checked={!!a.quantityEnabled} onChange={(e) => updateAttribute(gi, ai, { quantityEnabled: !!e.target.checked })} disabled={regularDeleteDisabled} />
                                    </label>
                                  </div>
                                )}
                                {!g.optional && (
                                  <div className="attribute-field checkbox-field vertical">
                                    <div className="checkbox-top-label">Default</div>
                                    <label className="vp-form-checkbox">
                                      {
                                        // Attributes with positive amount cannot be defaultSelected
                                        (() => {
                                          const cannotBeDefault = Number(a.amount || 0) > 0;
                                          const checked = !!a.defaultSelected && !cannotBeDefault;
                                          return (
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={(e) => updateAttribute(gi, ai, { defaultSelected: !!e.target.checked })}
                                              disabled={regularDeleteDisabled || cannotBeDefault}
                                            />
                                          );
                                        })()
                                      }
                                    </label>
                                  </div>
                                )}
                                { canDelete && (
                                  <div className="attribute-field delete-field">
                                    <button type="button" className="vp-attr-delete" onClick={() => removeAttribute(gi, ai)} aria-label="Remove attribute">
                                      <FiTrash2 size={16} />
                                    </button>
                                  </div>
                                )}
                                <div className="attribute-field amount-preview" style={{ minWidth: 90, textAlign: 'right', color: 'var(--text-muted, #6c6c6c)', fontWeight: 400, fontSize: 14, marginLeft: 12, marginRight: 12 }}>
                                  {previewText}
                                </div>
                              </div>
                            );
                          })}
                          <div>
                            <button type="button" className="btn btn-primary" onClick={() => addAttributeToGroup(gi)}>Add Attribute</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="add-group-row">
                      <button type="button" className="vp-add-group" onClick={addAttributeGroup}>+ Add Group</button>
                    </div>
                    <div className="attribute-help" style={{ marginTop: 12 }}>
                      <strong>About Attribute Groups</strong>
                      <div style={{ marginTop: 6 }}>
                        <div><strong>Attribute group fields</strong></div>
                        <ul style={{ margin: '6px 0 0 18px' }}>
                          <li><strong>Key</strong> - Internal identifier used by the system (e.g. "size").</li>
                          <li style={{ marginTop: 6 }}><em>Naming rule:</em> Group <strong>keys</strong> should be <strong>snake_case</strong> — lowercase letters, digits and underscores only, and should start with a letter. Example: <code>size</code>, <code>spice_level</code>, <code>add_ons</code>.</li>
                          <li><strong>Title</strong> - Visible label shown to customers (e.g. "Size").</li>
                          <li><strong>Type</strong> - "Single-select" (choose one) or "Multi-select" (choose many).</li>
                          <li><strong>Optional</strong> - When enabled, customers may skip this group.</li>
                          <li><strong>Min required</strong> - Minimum number of selections required from this group (shown only for required multi-select groups).</li>
                        </ul>

                        <div style={{ marginTop: 8 }}><strong>Attribute fields</strong></div>
                        <ul style={{ margin: '6px 0 0 18px' }}>
                          <li><strong>Name</strong> - Option label shown to customers (e.g. "Regular").</li>
                          <li><strong>Price type</strong> - "Flat" or "Percent" (also supports minus variants) applied to the base price.</li>
                          <li><strong>Amount</strong> - Numeric value for the price adjustment.</li>
                          <li><strong>Qty enabled</strong> - When enabled, the customer may choose a quantity for this option.</li>
                          <li><strong>Default selected</strong> - Marks this option as selected by default (used for required single-select or required multi-select to match Min required).</li>
                        </ul>

                        <p style={{ margin: '8px 0 0 0', fontSize: 13 }}>
                          Notes: The <strong>Size</strong> group is required and single-select; a default "Regular" attribute is provided and cannot be removed. Percent amounts are relative to the product base price. You can drag to rearrange attribute groups and attributes to control the display order.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
            </form>
            <div className="vp-modal-footer">
              <button className="btn btn-secondary" type="button" onClick={handleCancel}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="vp-edit-form" disabled={loading || !form.name || !form.price || !form.description || !form.category}>
                {loading ? (editing ? 'Saving...' : 'Creating...') : (editing ? 'Save' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doDeleteConfirmed}
        title="Delete product?"
        message="Are you sure you want to delete this product? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
};

export default VendorProducts;
