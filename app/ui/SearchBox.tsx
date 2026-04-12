'use client';

import { TextField, InputAdornment } from '@mui/material';
import { Search } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBox({ value, onChange }: SearchBoxProps): React.ReactElement {
  return (
    <TextField
      fullWidth
      variant="outlined"
      placeholder="Search..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search size={20} className="text-gray-400" />
            </InputAdornment>
          ),
        },
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: '12px',
        },
      }}
    />
  );
}
