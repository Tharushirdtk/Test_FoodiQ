import React from 'react';
import '../styles/spinner.css';

const LoadingSpinner = ({ size = 40, inline = false }) => {
  const style = { width: size, height: size };
  return (
    <div className={"loading-spinner-wrapper" + (inline ? ' inline' : '')} style={inline ? {} : {}}>
      <div className="loading-spinner" style={style} />
    </div>
  );
};

export default LoadingSpinner;
