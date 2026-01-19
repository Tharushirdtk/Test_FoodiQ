import React from 'react';
import { FiX } from 'react-icons/fi';
import '../styles/SubPage.css';
import '../styles/ProductPage.css';
import '../styles/EditAttributesModal.css';
import LoadingSpinner from './LoadingSpinner';

// Helpers copied/adapted from ProductPage to keep behavior identical
const computeSizeDisplayPrice = (attr, basePrice) => {
  const prodPrice = Number(basePrice || 0);
  const pt = String(attr.priceType || 'flat').toLowerCase();
  const amt = Number(attr.amount || 0);
  let result = prodPrice;
  if (pt === 'flat') result = prodPrice + amt;
  else if (pt === 'minus-flat') result = prodPrice - amt;
  else if (pt === 'percent') result = prodPrice + (prodPrice * (amt / 100));
  else if (pt === 'minus-percent') result = prodPrice - (prodPrice * (amt / 100));
  return `Rs ${(Math.round(result * 100) / 100).toFixed(2)}`;
};

const computeAttributeAddon = (attr, baseWithSize) => {
  const base = Number(baseWithSize || 0);
  const pt = String(attr.priceType || 'flat').toLowerCase();
  const amt = Number(attr.amount || 0);
  let addon = 0;
  if (pt === 'percent') addon = base * (amt / 100);
  else if (pt === 'minus-percent') addon = - (base * (amt / 100));
  else if (pt === 'minus-flat') addon = -amt;
  else addon = amt;
  return Math.round(addon * 100) / 100;
};

const formatAttributeLabel = (a, qty = 1, baseWithSize = 0) => {
  const pt = String(a.priceType || 'flat').toLowerCase();
  const amt = Number(a.amount || 0);
  if (pt === 'percent') return `${amt}%`;
  if (pt === 'minus-percent') return `-${amt}%`;
  // for flat types show computed amount per qty using baseWithSize where relevant
  const numeric = computeAttributeAddon(a, baseWithSize) * qty;
  return `${numeric >= 0 ? '+\u00A0Rs\u00A0' + numeric.toFixed(2) : '-\u00A0Rs\u00A0' + Math.abs(numeric).toFixed(2)}`;
};

const EditAttributesModal = ({ editingItem, editingProduct, selectedAttributes = [], setSelectedAttributes, onClose, onSave, saving, loading, validationError }) => {
  // scroll to validation error when it appears
  React.useEffect(() => {
    if (!validationError) return;
    try {
      const body = document.querySelector('.ea-modal-body');
      const el = body && body.querySelector('.ea-validation-error');
      if (el && body) {
        // scroll the modal body so the error is visible
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {}
  }, [validationError]);

  if (!editingItem && !loading) return null;

  const stop = (e) => e.stopPropagation();

  const isAttrSelected = (id) => selectedAttributes.some(s => String(s.id) === String(id));

  // compute baseWithSize: base product price adjusted by selected size (if any)
  const computeBaseWithSize = () => {
    const base = Number(editingItem?.price || 0);
    const sizeSel = (selectedAttributes || []).find(s => /size/i.test(String(s.groupKey || '')));
    if (!sizeSel) return base;
    // apply size priceType/amount to base
    const pt = String(sizeSel.priceType || 'flat').toLowerCase();
    const amt = Number(sizeSel.amount || 0);
    let res = base;
    if (pt === 'flat') res = base + amt;
    else if (pt === 'minus-flat') res = base - amt;
    else if (pt === 'percent') res = base + (base * (amt / 100));
    else if (pt === 'minus-percent') res = base - (base * (amt / 100));
    return Math.round(res * 100) / 100;
  };

  const baseWithSize = computeBaseWithSize();

  const handleSelectSingle = (groupKey, a) => {
    const def = { groupKey, id: a._id || a.id, name: a.name, priceType: a.priceType || 'flat', amount: a.amount || 0, quantity: 1 };
    setSelectedAttributes(prev => {
      const withoutGroup = (prev || []).filter(p => p.groupKey !== groupKey);
      return [...withoutGroup, def];
    });
  };

  const handleToggleMulti = (groupKey, a) => {
    const sel = selectedAttributes.find(s => String(s.id) === String(a._id || a.id));
    if (sel) {
      setSelectedAttributes(prev => prev.filter(p => String(p.id) !== String(a._id || a.id)));
    } else {
      setSelectedAttributes(prev => [...(prev || []), { groupKey, id: a._id || a.id, name: a.name, priceType: a.priceType || 'flat', amount: a.amount || 0, quantity: 1 }]);
    }
  };

  const updateQuantity = (id, q) => {
    setSelectedAttributes(prev => prev.map(p => String(p.id) === String(id) ? ({ ...p, quantity: q }) : p));
  };

  return (
    <div className="ea-modal-overlay" onClick={onClose}>
      <div className="ea-modal-wrapper" onClick={stop} role="dialog" aria-modal="true">
        <div className="ea-modal-header">
          <h3>{editingItem ? `Edit: ${editingItem.name}` : 'Edit Item'}</h3>
          <button className="modal-close" onClick={onClose}><FiX size={20} /></button>
        </div>

        <div className="ea-modal-body" ref={(el) => { /* keep for scrolling if needed */ }}>
          {validationError ? (
            <div className="ea-validation-error" role="alert" style={{ marginBottom: 12, padding: 12, background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 6 }}>
              {validationError}
            </div>
          ) : null}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <LoadingSpinner size={48} />
            </div>
          ) : editingProduct ? (
            (editingProduct.attributeGroups || []).map((g) => {
              const groupKey = (g.key || g.title || '').toString();
              const groupKeyNorm = groupKey.toLowerCase();
              const isSizeGroup = groupKeyNorm === 'size' || groupKeyNorm === 'sizes';
              return (
                <div key={g.key || g.title} style={{ marginBottom: 12 }}>
                  <h4>{g.title || g.key} {g.optional ? <span style={{ fontSize: 12 }}>(Optional)</span> : null}</h4>

                  {g.type === 'single-select' ? (
                    isSizeGroup ? (
                      <div className="size-options">
                        {(g.attributes || []).map((a) => (
                          <button
                            key={String(a._id || a.id || a.name)}
                            className={`size-btn ${isAttrSelected(a._id || a.id) ? 'active' : ''}`}
                            onClick={() => handleSelectSingle(groupKey, a)}
                          >
                            <div className="size-name">{a.name}</div>
                            <div className="size-price">{computeSizeDisplayPrice(a, editingItem?.price)}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="choice-options">
                        {(g.attributes || []).map((a) => {
                          const addon = computeAttributeAddon(a, baseWithSize);
                          return (
                            <button
                              key={String(a._id || a.id || a.name)}
                              className={`choice-btn ${isAttrSelected(a._id || a.id) ? 'active' : ''}`}
                              onClick={() => handleSelectSingle(groupKey, a)}
                            >
                              <span>{a.name}</span>
                              {addon !== 0 && <span className="choice-price">{formatAttributeLabel(a, 1, baseWithSize)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="multi-options">
                      {(g.attributes || []).map((a) => {
                        const sel = selectedAttributes.find(s => String(s.id) === String(a._id || a.id));
                        const addon = computeAttributeAddon(a, baseWithSize);
                        return (
                          <div
                            key={String(a._id || a.id)}
                            className={`multi-item ${sel ? 'selected' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleToggleMulti(groupKey, a)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleMulti(groupKey, a); } }}
                          >
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={!!sel} onChange={(e) => { e.stopPropagation(); handleToggleMulti(groupKey, a); }} />
                              <span>{a.name}</span>
                            </label>

                            {a.quantityEnabled && sel && (
                              <div style={{ marginLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                                <input type="number" min={1} value={sel.quantity || 1} onClick={(e) => e.stopPropagation()} onChange={(e) => updateQuantity(sel.id, Math.max(1, Number(e.target.value) || 1))} style={{ width: 64 }} />
                              </div>
                            )}

                            <div style={{ marginLeft: 12 }}>
                              {addon !== 0 && <span className="choice-price">{formatAttributeLabel(a, sel ? (sel.quantity || 1) : 1, baseWithSize)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div>
              <p>Attributes not available for this item.</p>
            </div>
          )}
        </div>

        <div className="ea-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default EditAttributesModal;
