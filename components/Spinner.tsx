
import React from 'react';

function Spinner() {
  return (
    <div className="relative w-5 h-5">
      <div className="absolute top-0 left-0 w-full h-full border border-white/10 rounded-full"></div>
      <div className="absolute top-0 left-0 w-full h-full border-t border-cyan-400 rounded-full animate-spin"></div>
    </div>
  );
}

export default Spinner;
