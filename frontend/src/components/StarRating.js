import React from 'react';
import { FiStar } from 'react-icons/fi';
import { AiFillStar } from 'react-icons/ai';
import '../styles/StarRating.css';

const StarRating = ({ value = 0, onChange, interactive = true, size = 20 }) => {
  const handleClick = (v) => {
    if (!interactive) return;
    if (onChange) onChange(v);
  };

  return (
    <div className="star-rating" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          className={`star-btn ${value >= s ? 'active' : ''} ${interactive ? 'interactive' : 'readonly'}`}
          onClick={() => handleClick(s)}
          aria-pressed={value >= s}
        >
          {value >= s ? <AiFillStar size={size} /> : <FiStar size={size} />}
        </button>
      ))}
    </div>
  );
};

export default StarRating;
