import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'

/**
 * A date-only field with MUI's own calendar, not the browser's native one —
 * every other field in the app already looks like this. Keeps the same
 * contract every caller already had with `type="date"`: value and onChange
 * both deal in a plain `'YYYY-MM-DD'` string (or `''` for no date), never a
 * `dayjs`/`Date` object, so nothing downstream (validation, the API) has to
 * change.
 */
export default function DateField({ value, onChange, onBlur, label, fullWidth, required, error, helperText, disabled, minDate, maxDate, margin, sx }) {
  return (
    <DatePicker
      label={label}
      value={value ? dayjs(value) : null}
      onChange={(d) => onChange(d && d.isValid() ? d.format('YYYY-MM-DD') : '')}
      disabled={disabled}
      minDate={minDate ? dayjs(minDate) : undefined}
      maxDate={maxDate ? dayjs(maxDate) : undefined}
      sx={sx}
      slotProps={{ textField: { fullWidth, required, error, helperText, margin, onBlur } }}
    />
  )
}
