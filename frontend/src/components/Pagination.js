import React from 'react';
import '../styles/Pagination.css';

const Pagination = ({ page = 1, pages = 1, onChange = () => {}, total = 0, perPage = 20 }) => {
  if (!pages || pages <= 1) return null;

  const handle = (p) => {
    if (p < 1 || p > pages || p === page) return;
    onChange(p);
  };

  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);

  return (
    <div className="pagination">
      <button className="btn btn-secondary btn-sm" disabled={page<=1} onClick={() => handle(page-1)}>Previous</button>
      <div className="page-numbers">
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const pageNum = start + i;
          if (pageNum > end) return null;
          return (
            <button key={pageNum} className={`page-btn ${page === pageNum ? 'active' : ''}`} onClick={() => handle(pageNum)}>{pageNum}</button>
          );
        })}
        {pages > 5 && (
          <>
            <span className="page-dots">...</span>
            <button className={`page-btn ${page === pages ? 'active' : ''}`} onClick={() => handle(pages)}>{pages}</button>
          </>
        )}
      </div>
      <button className="btn btn-secondary btn-sm" disabled={page>=pages} onClick={() => handle(page+1)}>Next</button>
    </div>
  );
};

export default Pagination;
