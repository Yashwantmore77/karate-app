import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import dayjs from 'dayjs'

export default function DateTimeField({ value, onChange, onBlur, label, fullWidth, error, helperText, disabled, margin, sx }) {
  return (
    <DateTimePicker
      label={label}
      value={value ? dayjs(value) : null}
      onChange={(d) => onChange(d && d.isValid() ? d.format('YYYY-MM-DDTHH:mm') : '')}
      disabled={disabled}
      sx={sx}
      slotProps={{ textField: { fullWidth, error, helperText, margin, onBlur } }}
    />
  )
}
