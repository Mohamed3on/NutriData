import React from 'react';

export const Tooltip: React.FC = () => {
  return (
    <div id='tooltip-container'>
      <style>
        {`
          .tooltip-icon {
            cursor: pointer;
            color: #888;
            font-size: 14px;
          }
          .tooltip-text {
            visibility: hidden;
            width: 200px;
            background-color: #333;
            color: #fff;
            text-align: center;
            border-radius: 6px;
            padding: 8px;
            position: absolute;
            z-index: 1;
            top: 125%;
            left: 50%;
            transform: translateX(-50%);
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 12px;
          }
          #tooltip-container:hover .tooltip-text {
            visibility: visible;
            opacity: 1;
          }
        `}
      </style>
      <span className='tooltip-icon'>ⓘ</span>
      <span className='tooltip-text'>
        Data sourced directly from the product page. NutriData not responsible for any missing or
        inaccurate information.
      </span>
    </div>
  );
};
