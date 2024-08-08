import React from 'react';

interface FormInput {
  label: string;
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const FormInputComponent: React.FC<FormInput> = ({ label, name, value, onChange }) => {
  return (
    <div>
      <label>
        {label}&nbsp;
        <input type="text" name={name} value={value || ''} onChange={onChange} />
      </label>
    </div>
  );
};

export default FormInputComponent;
