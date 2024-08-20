import React from 'react';

export const Tooltip: React.FC = () => {
  return (
    <div className='relative inline-block group'>
      <span className='cursor-pointer text-gray-500 text-sm'>ⓘ</span>
      <span className='invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 absolute z-10 w-48 bg-gray-800 text-white text-xs rounded-md py-2 px-3 -left-24 bottom-full mb-2 text-center'>
        Data sourced directly from the product page. NutriData not responsible for any missing or
        inaccurate information.
      </span>
    </div>
  );
};
