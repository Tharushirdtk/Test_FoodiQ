import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import NotificationsButton from '../components/NotificationsButton';
import orderService from '../services/orderService';
import driverService from '../services/driverService';
import conversationService from '../services/conversationService';
import SupportChat from '../components/SupportChat';
import '../styles/OrderChatPage.css';

const OrderChatPage = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [convoId, setConvoId] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState('Support');
  const [list, setList] = useState([]);
  const [convList, setConvList] = useState([]);
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let initialConvs = null;
    (async () => {
      try {
        const o = await orderService.getOrder(id);
        if (!mounted) return;
        setOrder(o);
        // build participant list: vendors (one per vendor with at least one item), driver (if any), customer
        const items = [];
        const vendorMap = new Map();

        // vendors from order.items (ensure one entry per unique vendor)
        if (Array.isArray(o.items) && o.items.length) {
          for (const it of o.items) {
            if (!it || !it.vendor) continue;
            const vid = typeof it.vendor === 'object' ? (it.vendor._id || it.vendor.id) : it.vendor;
            if (!vid) continue;
            if (!vendorMap.has(String(vid))) {
              const vendorObj = typeof it.vendor === 'object' ? it.vendor : null;
              const label = vendorObj ? ((vendorObj.vendorProfile && (vendorObj.vendorProfile.storeName || vendorObj.vendorProfile.name)) || vendorObj.displayName || vendorObj.name || `Vendor`) : `Vendor`;
              vendorMap.set(String(vid), { id: vid, label, type: 'vendor', vendorObj });
            }
          }
        }

        // also include vendors listed in vendorAddresses (if any), but avoid duplicates
        if (Array.isArray(o.vendorAddresses) && o.vendorAddresses.length) {
          o.vendorAddresses.forEach((v, idx) => {
            const vid = v && v.vendor ? (v.vendor._id || v.vendor) : `vendor-addr-${idx}`;
            if (!vendorMap.has(String(vid))) {
              const vendorObj = v.vendor || null;
              const label = (v.address && (v.address.label || v.address.street)) || (vendorObj && ((vendorObj.vendorProfile && (vendorObj.vendorProfile.storeName || vendorObj.vendorProfile.name)) || vendorObj.displayName || vendorObj.name)) || `Vendor ${idx+1}`;
              vendorMap.set(String(vid), { id: vid, label, type: 'vendor', vendorObj });
            }
          });
        } else if (o.vendorAddress && !vendorMap.size) {
          vendorMap.set('vendor-0', { id: 'vendor-0', label: ((o.vendorAddress && (o.vendorAddress.label || o.vendorAddress.street)) || 'Vendor'), type: 'vendor', vendorObj: null });
        }

        // push vendors into items list preserving insertion order
        for (const v of vendorMap.values()) items.push(v);
        // driver — attach a driver entry that may include a driverObj for later resolution
        let driverEntry = null;
        if (o.driver) {
          if (typeof o.driver === 'object') {
            driverEntry = { id: o.driver._id || o.driver.id, label: (o.driver.name || 'Driver'), type: 'driver', driverObj: o.driver };
          } else {
            driverEntry = { id: o.driver, label: 'Driver', type: 'driver', driverObj: null };
          }
          items.push(driverEntry);
        }
        // customer (order owner)
        const customerId = o.user && (o.user._id || o.user) ? (o.user._id || o.user) : 'customer';
        const customerLabel = (o.user && (o.user.displayName || o.user.name)) || (user && (user.displayName || user.name)) || 'Customer';
        items.push({ id: customerId, label: customerLabel, type: 'customer' });
        // Remove the current logged-in user from the list to avoid showing a "self" chat
        let filtered = items.filter(it => {
          try { return !(user && it.id && String(it.id) === String(user._id)); } catch (e) { return true; }
        });
        // Drivers should not see a "driver" participant (their own driver profile)
        if (role === 'driver') {
          filtered = filtered.filter(it => it.type !== 'driver');
        }
        setList(filtered);
        // If we have a driverEntry with only an id, try to resolve the Driver -> User mapping so clicks map to driver.user
        try {
          if (driverEntry && !driverEntry.driverObj && driverEntry.id) {
            const drv = await driverService.getDriver(driverEntry.id);
            if (drv) {
              driverEntry.driverObj = drv;
              setList((prev) => prev.map(it => (String(it.id) === String(driverEntry.id) ? { ...it, driverObj: drv } : it)));
            }
          }
        } catch (e) { /* ignore driver fetch errors */ }
        // Debug log: show what vendor entries were derived for chat navigator
        try {
          // eslint-disable-next-line no-console
          console.debug('[OrderChatPage] participants derived:', items.map(it => ({ id: it.id, label: it.label, type: it.type })));
          // eslint-disable-next-line no-console
          console.debug('[OrderChatPage] raw order vendorAddresses:', o.vendorAddresses, 'raw items:', o.items);
        } catch (e) {}

        // Fetch active conversations for this order (so we can surface the exact conversation(s) the other party used)
          try {
          const convs = await conversationService.listForOrder(id);
          if (Array.isArray(convs)) {
            // Deduplicate conversations by participantsKey when possible, falling back
            // to a generated sorted participants key (stringified ids).
            try {
              const seen = new Set();
              const unique = [];
              for (const c of convs) {
                // Prefer using a participantsKey when present. Otherwise, try to
                // construct a stable 'other-participant' key using the other
                // participant's role + id/displayName which helps dedupe driver
                // conversations created with different id types (Driver._id vs User._id).
                let key = c.participantsKey || null;
                if (!key) {
                  try {
                    // If participants are populated objects, build a role-aware key
                    const parts = Array.isArray(c.participants) ? c.participants.map(p => (p && (p._id || p)) || p) : [];
                    key = parts.map(p => String(p)).sort().join(':');
                  } catch (e) { key = JSON.stringify(c.participants || []); }
                }

                // Also build a loose 'other' key to collapse conversations that
                // effectively represent the same person (same role + displayName)
                let otherKey = null;
                try {
                  const parts = Array.isArray(c.participants) ? c.participants : [];
                  const other = parts.find(p => String((p && (p._id || p)) || p) !== String(user && (user._id || user.id)));
                  if (other) {
                    const role = other.role || (other.role === undefined ? 'unknown' : other.role);
                    const idPart = (other._id || other._id === 0) ? String(other._id) : (other._id ? String(other._id) : (other._id || other).toString ? String(other._id || other) : null);
                    const namePart = other.displayName || other.name || null;
                    otherKey = `${role}|${idPart || namePart || ''}`;
                  }
                } catch (e) { otherKey = null; }

                const chosenKey = otherKey || key;
                if (!seen.has(chosenKey)) {
                  seen.add(chosenKey);
                  unique.push(c);
                } else {
                  console.debug('[OrderChatPage] dropping duplicate conversation for key', chosenKey, { convId: c._id || c.id });
                }
              }
              setConvList(unique);
              initialConvs = unique;
              console.debug('[OrderChatPage] active conversations for order (deduped)', unique.map(c => ({ id: c._id || c.id, participants: c.participants })));
              // Detailed per-conversation debug for tracing duplicates/socket joins
              try {
                unique.forEach(c => {
                  const parts = Array.isArray(c.participants) ? c.participants.map(p => (p && (p._id || p)) || p) : [];
                  const key = c.participantsKey || parts.map(p => String(p)).sort().join(':');
                  const other = (c.participants || []).find(p => String((p && (p._1 || p)) || p) !== String(user && (user._id || user.id)));
                  console.debug('[OrderChatPage] conv debug', { convId: c._id || c.id, key, other: other ? { id: (other._id || other), role: other.role, name: other.displayName || other.name } : null });
                });
              } catch (e) {}
              // Remove any duplicate parties from the derived right-side participant list
              const convParticipantIds = unique.reduce((acc, c) => {
                const parts = Array.isArray(c.participants) ? c.participants.map(p => (p && (p._id || p)) || p) : [];
                parts.forEach(p => { if (p) acc.add(String(p)); });
                return acc;
              }, new Set());
              const deduped = filtered.filter(it => !convParticipantIds.has(String(it.id)));
              setList(deduped);
              console.debug('[OrderChatPage] right-side participant list after dedupe', deduped.map(i => ({ id: i.id, label: i.label, type: i.type })));
            } catch (e) {
              // fallback behavior if dedupe fails
              console.debug('[OrderChatPage] conversation dedupe failed', e && e.message);
              setConvList(convs);
            }
          }
        } catch (e) { console.debug('[OrderChatPage] listForOrder failed', e && e.message); }

        // open initial participant if provided in query
        const p = searchParams.get('participant');
        console.debug('[OrderChatPage] derived participant query param', { participantParam: p, derivedItems: items.map(it=>({id:it.id,label:it.label,type:it.type})) });
        if (p) {
          // find matching item id or assume it's a user id
          const found = items.find(it => String(it.id) === String(p));
          let participantId = null;
          if (found) {
            // Prefer canonical vendor user id when available
            if (found.type === 'vendor') {
              const vobj = found.vendorObj || null;
              if (vobj) participantId = vobj._id || vobj.id || vobj.vendorId || vobj.userId || found.id;
              else {
                // vendor placeholder (vendor-addr-<idx>) or unknown: attempt to resolve from order.vendorAddresses
                if (String(found.id).startsWith('vendor-addr-') && Array.isArray(o.vendorAddresses)) {
                  const idx = parseInt(String(found.id).split('vendor-addr-')[1], 10);
                  const addr = o.vendorAddresses[idx];
                  if (addr && addr.vendor) participantId = (addr.vendor._id || addr.vendor.id || addr.vendor);
                }
                if (!participantId) participantId = found.id;
              }
            } else if (found.type === 'driver') {
              // Resolve driver entry to the underlying user id when possible
              const dobj = found.driverObj || (o && o.driver && (o.driver.user || null));
              if (dobj) participantId = (dobj.user && (dobj.user._id || dobj.user)) || dobj._id || found.id;
              else participantId = found.id;
            } else {
              participantId = found.id;
            }
            if (found.label) setSelectedLabel(found.label);
          } else {
            participantId = p;
          }
          // create or get conversation for this participant — prefer reusing an
          // existing conversation discovered during the initial fetch to avoid
          // making a POST on initialization (which can trigger duplicate UI rows).
          try {
            // try to find a matching conversation from the initialConvs list
            let reused = null;
            try {
              if (initialConvs && Array.isArray(initialConvs)) {
                const cand = new Set([String(participantId)]);
                if (found) {
                  if (found.type === 'driver' && (found.driverObj || (o && o.driver))) {
                    const u = (found.driverObj && (found.driverObj.user || found.driverObj._id)) || (o && o.driver && (o.driver.user || o.driver._id));
                    if (u) cand.add(String((u._id || u)));
                  }
                  if (found.type === 'vendor' && found.vendorObj) {
                    const v = found.vendorObj._id || found.vendorObj.user || found.vendorObj.id;
                    if (v) cand.add(String(v));
                  }
                }
                reused = initialConvs.find(c => {
                  try {
                    const parts = Array.isArray(c.participants) ? c.participants : [];
                    for (const p of parts) {
                      const pid = String((p && (p._id || p)) || p);
                      if (cand.has(pid)) return true;
                      // fallback: match by role+displayName
                      const roleName = (p && p.role) || null;
                      const display = (p && (p.displayName || p.name)) || null;
                      if (display && roleName && found) {
                        const fiRole = found.type === 'vendor' ? 'vendor' : found.type === 'driver' ? 'driver' : (found.type === 'customer' ? 'customer' : null);
                        if (fiRole && fiRole === roleName && String(display) === String(found.label)) return true;
                      }
                    }
                    return false;
                  } catch (e) { return false; }
                });
              }
            } catch (e) { /* ignore */ }

            if (reused) {
              console.debug('[OrderChatPage] reusing existing initial conversation for participant', { convId: reused._id || reused.id });
              setConvoId(reused._id || reused.id);
            } else {
              console.debug('[OrderChatPage] creating/getting conversation for participant', { orderId: id, participantId });
              const conv = await conversationService.createOrGet(id, participantId);
              console.debug('[OrderChatPage] createOrGet returned', conv && { convId: conv._id || conv.id, participants: conv.participants });
              setConvoId(conv._id || conv.id);
            }
          } catch (e) { console.error('[OrderChatPage] createOrGet failed', e); }
        } else {
          // If no explicit participant requested, try to open the most recently active conversation for this user on the order
          try {
            const convs = await conversationService.listForOrder(id);
            if (Array.isArray(convs) && convs.length) {
              const first = convs[0];
              if (first && (first._id || first.id)) {
                console.debug('[OrderChatPage] auto-opening most recent conversation for order', { convId: first._id || first.id, participants: first.participants });
                setConvoId(first._id || first.id);
                if (first.participants && Array.isArray(first.participants)) {
                  // set selected label to indicate who the conversation is with when possible
                  const other = first.participants.find(p => String(p) !== String(user && (user._id || user.id)));
                  if (other) setSelectedLabel('Chat');
                }
              }
            }
          } catch (e) {
            /* ignore */
          }
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openChat = async (rawParticipantId, label) => {
    try {
      let participantId = rawParticipantId;
      // Resolve vendor placeholder or vendor object to a canonical user id when possible
      try {
        const found = list.find(it => String(it.id) === String(rawParticipantId));
        if (found && found.type === 'vendor') {
          const vobj = found.vendorObj || null;
          if (vobj) participantId = vobj._id || vobj.id || vobj.vendorId || vobj.userId || found.id;
          else if (String(found.id).startsWith('vendor-addr-') && order && Array.isArray(order.vendorAddresses)) {
            const idx = parseInt(String(found.id).split('vendor-addr-')[1], 10);
            const addr = order.vendorAddresses[idx];
            if (addr && addr.vendor) participantId = (addr.vendor._id || addr.vendor.id || addr.vendor);
          }
        } else if (found && found.type === 'driver') {
          const dobj = found.driverObj || null;
          if (dobj) participantId = (dobj.user && (dobj.user._id || dobj.user)) || dobj._id || found.id;
          else if (order && order.driver && typeof order.driver === 'object' && order.driver.user) participantId = order.driver.user._id || order.driver.user || found.id;
        }
      } catch (e) {}

      // Try to find an existing conversation in `convList` that already contains
      // the desired participant to avoid creating duplicates.
      console.debug('[OrderChatPage] openChat requested for participant', { rawParticipantId, resolvedParticipantId: participantId, label });
        try {
          // Build candidate ids to match against existing conversations.
          // Include the raw participantId and any resolved ids (driver.user, vendor user) from the `list` mapping.
          const candidateIds = new Set([String(participantId)]);
          let foundItem = null;
          try {
            foundItem = list.find(it => String(it.id) === String(rawParticipantId) || String(it.id) === String(participantId));
            if (foundItem) {
              if (foundItem.type === 'driver' && foundItem.driverObj) {
                const u = foundItem.driverObj.user || (foundItem.driverObj._id ? foundItem.driverObj._id : null);
                if (u) candidateIds.add(String((u._id || u)));
              }
              if (foundItem.type === 'vendor' && foundItem.vendorObj) {
                const v = foundItem.vendorObj._id || foundItem.vendorObj.user || foundItem.vendorObj.id;
                if (v) candidateIds.add(String(v));
              }
            }
          } catch (e) {}

        // Also consider convList entries that may reference the same person by displayName+role
        const foundConv = convList.find(c => {
          try {
            // participants may be populated objects or ids
            const parts = Array.isArray(c.participants) ? c.participants : [];
            for (const p of parts) {
              const pid = String((p && (p._id || p)) || p);
              if (candidateIds.has(pid)) return true;
              // fallback: match by role+displayName
              const roleName = (p && p.role) || null;
              const display = (p && (p.displayName || p.name)) || null;
              if (display && roleName && foundItem) {
                const fiRole = foundItem.type === 'vendor' ? 'vendor' : foundItem.type === 'driver' ? 'driver' : (foundItem.type === 'customer' ? 'customer' : null);
                if (fiRole && fiRole === roleName && String(display) === String(foundItem.label)) return true;
              }
            }
            return false;
          } catch (e) { return false; }
        });

        if (foundConv) {
          console.debug('[OrderChatPage] reusing existing conversation from convList (matched candidateIds)', { convId: foundConv._id || foundConv.id, candidateIds: Array.from(candidateIds) });
          setConvoId(foundConv._id || foundConv.id);
          if (label) setSelectedLabel(label);
          return;
        }
      } catch (e) { console.debug('[OrderChatPage] openChat existing-conv lookup failed', e && e.message); }

      console.debug('[OrderChatPage] creating conversation via API for participant', participantId);
      const conv = await conversationService.createOrGet(id, participantId);
      const convId = conv._1 || conv.id;
      console.debug('[OrderChatPage] createOrGet returned', { convId, participants: conv.participants });
      setConvoId(convId);
      if (label) setSelectedLabel(label);

      // Insert created conversation into convList (deduping) so UI reflects it immediately
      try {
        setConvList(prev => {
          const arr = Array.isArray(prev) ? prev.slice() : [];
          // build key for the new conv
          const parts = Array.isArray(conv.participants) ? conv.participants.map(p => (p && (p._id || p)) || p) : [];
          const key = conv.participantsKey || parts.map(p => String(p)).sort().join(':');
          const exists = arr.some(c => {
            const cparts = Array.isArray(c.participants) ? c.participants.map(p => (p && (p._id || p)) || p) : [];
            const ck = c.participantsKey || cparts.map(p => String(p)).sort().join(':');
            return ck === key;
          });
          if (!exists) {
            console.debug('[OrderChatPage] inserting new conversation into convList', { convId: conv._id || conv.id, key });
            arr.unshift(conv);
          } else {
            console.debug('[OrderChatPage] new conversation already exists in convList, skipping insert', { convId: conv._id || conv.id, key });
          }
          return arr;
        });
      } catch (e) { console.debug('[OrderChatPage] convList insert failed', e && e.message); }
    } catch (e) {
      console.error('openChat failed', e);
    }
  };

  return (
    <div className="order-chat-page order-chat-sub-page">
      <header className="sub-header">
        <button className="btn btn-icon" onClick={() => navigate(-1)}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Order Chat</h1>
        <div className="header-actions">
          <NotificationsButton />
        </div>
      </header>
      <div className="chat-wrapper">
        <div className="chat-main full-height">
          {convoId ? <SupportChat conversationId={convoId} inline title={selectedLabel} /> : <div style={{ padding: 20 }}>Select a chat on the right to start messaging about this order.</div>}
        </div>
        <aside className="chat-sidebar">
          <h3>Chats</h3>
            <div className="chat-list">
              {(() => {
                // Defensive: render each conversation id only once to avoid duplicate UI rows
                const seenIds = new Set();
                const uniqueConvs = [];
                for (const c of convList) {
                  const idKey = String(c._id || c.id || '');
                  if (!seenIds.has(idKey)) {
                    seenIds.add(idKey);
                    uniqueConvs.push(c);
                  }
                }
                return uniqueConvs.map((c) => {
                const other = (c.participants || []).find(p => String(p._id || p) !== String(user && (user._id || user.id)));
                let label = 'Chat';
                let roleTag = 'chat';
                if (other) {
                  roleTag = other.role === 'vendor' ? 'vendor' : other.role === 'driver' ? 'driver' : 'customer';
                  if (other.role === 'vendor') {
                    // Prefer store name for vendor participants. Try to find matching vendor in `order.items` or `order.vendorAddresses`.
                    let storeName = null;
                    try {
                      if (order && Array.isArray(order.items)) {
                        const vmatch = order.items.find(it => it && it.vendor && ((it.vendor._id && String(it.vendor._id) === String(other._id)) || (it.vendor._id && String(it.vendor._id) === String(other)) || (String(it.vendor) === String(other._id))));
                        if (vmatch && vmatch.vendor && vmatch.vendor.vendorProfile) storeName = vmatch.vendor.vendorProfile.storeName || vmatch.vendor.vendorProfile.name || storeName;
                      }
                      if (!storeName && order && Array.isArray(order.vendorAddresses)) {
                        const vaddr = order.vendorAddresses.find(va => va && va.vendor && ((va.vendor._id && String(va.vendor._id) === String(other._id)) || String(va.vendor) === String(other._id)));
                        if (vaddr && vaddr.vendor && vaddr.vendor.vendorProfile) storeName = vaddr.vendor.vendorProfile.storeName || vaddr.vendor.vendorProfile.name || storeName;
                      }
                    } catch (e) { /* ignore */ }
                    label = storeName || other.displayName || other.name || 'Vendor';
                  } else {
                    label = other.displayName || other.name || (other.role === 'driver' ? 'Driver' : 'User');
                  }
                }
                return (
                  <button key={c._id || c.id} className="chat-list-item" onClick={() => { setConvoId(c._id || c.id); setSelectedLabel(label); }}>
                    <div className="chat-item-row">
                      <div className="chat-name">{label}</div>
                      <div className={`chat-role-tag role-${roleTag}`}>{roleTag === 'vendor' ? 'Vendor' : roleTag === 'driver' ? 'Driver' : 'Customer'}</div>
                    </div>
                  </button>
                );
              });
            })()}
              {list.map((it) => (
                <button key={it.id} className="chat-list-item" onClick={() => openChat(it.id, it.label)}>
                  <div className="chat-item-row">
                    <div className="chat-name">{it.label}</div>
                    <div className={`chat-role-tag role-${it.type}`}>{it.type === 'vendor' ? 'Vendor' : it.type === 'driver' ? 'Driver' : 'Customer'}</div>
                  </div>
                </button>
              ))}
            </div>
        </aside>
      </div>
    </div>
  );
};

export default OrderChatPage;
