import React, {useId,useState} from 'react';

export default function PasswordInput({label='Password',id,className='',...props}) {
  const generatedId=useId();
  const inputId=id || generatedId;
  const [visible,setVisible]=useState(false);
  const toggleLabel=visible?'Hide password':'Show password';
  return <div>
    <label htmlFor={inputId}>{label}</label>
    <div className="relative mt-1">
      <input {...props} id={inputId} type={visible?'text':'password'}
        className={`mt-0 min-h-11 pr-14 ${className}`}/>
      <button type="button" aria-label={toggleLabel} title={toggleLabel}
        aria-controls={inputId} disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md bg-transparent p-0 text-ink hover:bg-blue-50"
        onClick={()=>setVisible(value=>!value)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" focusable="false">
          {visible?<>
            <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c7 0 10 7 10 7a17.9 17.9 0 0 1-3.1 4.2M6.5 6.5C3.5 8.5 2 12 2 12s3 7 10 7a10.6 10.6 0 0 0 5.5-1.5"/>
          </>:<>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/>
            <circle cx="12" cy="12" r="3"/>
          </>}
        </svg>
      </button>
    </div>
  </div>;
}
