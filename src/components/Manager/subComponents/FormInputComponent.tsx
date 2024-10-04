import React from 'react';

interface FormInput {
  label: string;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const FormInputComponent: React.FC<FormInput> = ({ label, name, value, onChange }) => {
  return (
    <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
      <label style={{ fontWeight: 'bold', marginRight: '1rem', minWidth: '120px' }}>
        {label}
      </label>
      <input
        type="text"
        name={name}
        value={value || ''}
        onChange={onChange}
        style={{
          padding: '0.5rem',
          width: '100%',
          maxWidth: '400px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '1rem',
        }}
      />
    </div>
  );
};

export default FormInputComponent;
