import { AppBar } from '@mui/material'

/**
 * The strip under the main nav that carries a page's own title, subtitle and
 * back button.
 *
 * Deliberately flat: AppNav is the app's one solid header, and a second opaque
 * bar directly beneath it reads as two competing headers rather than a heading
 * belonging to the page. Stripping the glass treatment lets the stage show
 * through, so this sits as page content that happens to be laid out like a bar.
 */
export default function PageBar({ children, ...props }) {
  return (
    <AppBar
      position="static"
      elevation={0}
      {...props}
      sx={{
        background: 'none',
        backgroundImage: 'none',
        backdropFilter: 'none',
        border: 'none',
        boxShadow: 'none',
        color: 'inherit',
        ...props.sx,
      }}
    >
      {children}
    </AppBar>
  )
}
