# Material UI Theme Best Practices Guide

**Status:** ✅ Theme refactoring in progress  
**Dev Server:** http://localhost:5173/ (Hot reload active)  
**Compilation:** ✅ Zero errors

---

## What Changed: Old CSS → Proper MUI Theme

### ❌ OLD WAY (Custom CSS)
```jsx
<Box sx={{ 
  bgcolor: '#f5f7fa',                    // Hardcoded hex
  background: 'linear-gradient(...)',   // Hardcoded gradient
  boxShadow: '0 2px 8px rgba(...)'      // Custom shadow
}}>
  Content
</Box>
```

### ✅ NEW WAY (MUI Theme)
```jsx
const theme = useTheme()
<Box sx={{ 
  bgcolor: 'background.default',        // Theme color token
  backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
  boxShadow: theme.shadows[2]           // Theme elevation
}}>
  Content
</Box>
```

---

## MUI Theme Structure

### Color Palette
```javascript
theme.palette = {
  primary: { main, light, dark, contrastText },
  secondary: { main, light, dark },
  success: { main },
  warning: { main },
  error: { main },
  info: { main },
  background: { default, paper },
  text: { primary, secondary, tertiary },
  action: { hover, focus },
}
```

### Spacing System
```javascript
theme.spacing() // 8px base unit
theme.spacing(1) // 8px
theme.spacing(2) // 16px
theme.spacing(3) // 24px
theme.spacing(4) // 32px
```

### Elevation & Shadows
```javascript
theme.shadows[0]  // No shadow
theme.shadows[1]  // Subtle shadow (elevation-1)
theme.shadows[2]  // Light shadow (elevation-2)
theme.shadows[4]  // Medium shadow
theme.shadows[8]  // Strong shadow
```

### Typography
```javascript
theme.typography = {
  h1, h2, h3, h4, h5, h6,
  body1, body2,
  subtitle1, subtitle2,
  caption, overline
}
```

---

## Migration Examples

### Example 1: AppBar with Gradient

**Before (Hardcoded):**
```jsx
<AppBar sx={{ 
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
}}>
```

**After (Theme-based):**
```jsx
const theme = useTheme()
<AppBar sx={{
  backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
}}>
```

Or use component styleOverrides in theme:
```javascript
components: {
  MuiAppBar: {
    styleOverrides: {
      root: {
        backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }
    }
  }
}
```

### Example 2: Background Color

**Before:**
```jsx
<Box sx={{ bgcolor: '#f5f7fa' }}>
```

**After:**
```jsx
<Box sx={{ bgcolor: 'background.default' }}>
```

### Example 3: Status Badges

**Before:**
```jsx
<Box sx={{
  bgcolor: '#fef3c7',
  color: '#92400e',
}}>
```

**After:**
```jsx
<Box sx={{
  bgcolor: 'warning.light',
  color: 'warning.dark',
}}>
```

### Example 4: Cards with Elevation

**Before:**
```jsx
<Card sx={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
```

**After:**
```jsx
<Card elevation={1}>  {/* Uses theme.shadows[1] */}
```

---

## Pages Updated to Proper Theme

### ✅ Completed (Using Theme Colors)
- **App.jsx** - ThemeProvider, custom palette
- **AdminTournamentList** - Theme colors, elevation
- **AdminTournamentDetail** - Theme colors, Chips
- **AdminCategoryDetail** - Theme colors, Table styling
- **RefereeCategoryList** - useTheme hook, theme.palette colors

### ⏳ To Complete (Still Using Hardcoded)
- **RefereeMatchList** - Remove gradient strings
- **RefereeMatchControl** - Use theme colors
- **JudgeMatchList** - Use theme colors
- **JudgeScoring** - Use theme colors
- **Login** - Use theme colors

---

## Best Practices for MUI Components

### 1. Use `useTheme` Hook in Components
```jsx
import { useTheme } from '@mui/material'

function MyComponent() {
  const theme = useTheme()
  
  return (
    <Box sx={{
      color: theme.palette.primary.main,
      backgroundColor: theme.palette.background.default,
    }}>
      Content
    </Box>
  )
}
```

### 2. Use `sx` Prop Instead of Style
```jsx
// Good
<Box sx={{ p: 2, bgcolor: 'primary.main' }} />

// Avoid
<Box style={{ padding: '16px', backgroundColor: '#667eea' }} />
```

### 3. Use Theme Spacing
```jsx
// Good - Uses 8px base unit
<Box sx={{ p: 2, mb: 3, gap: 2 }}>

// Avoid - Hardcoded pixels
<Box sx={{ padding: '16px', marginBottom: '24px', gap: '16px' }}>
```

### 4. Use Elevation System
```jsx
// Good - Uses theme.shadows
<Paper elevation={2} />
<Card elevation={1} />

// Avoid - Custom shadows
<Box sx={{ boxShadow: '0 2px 8px rgba(...)' }} />
```

### 5. Use Theme Variants
```jsx
// Good - MUI variant
<Typography variant="h6">Heading</Typography>
<Button variant="contained">Click me</Button>

// Avoid - Custom styling
<Typography sx={{ fontSize: '20px', fontWeight: 700 }}>
<Button sx={{ backgroundColor: '#667eea' }}>
```

---

## Color Usage Pattern

### Semantic Colors
```jsx
<Alert severity="success" />     // Green
<Alert severity="warning" />     // Orange/Yellow
<Alert severity="error" />       // Red
<Alert severity="info" />        // Blue
```

### Status Chips
```jsx
<Chip 
  label="Active" 
  color="success" 
  sx={{ bgcolor: 'success.light', color: 'success.dark' }}
/>
```

### Badges
```jsx
<Chip 
  label="Draft" 
  sx={{
    bgcolor: theme.palette.warning.light,
    color: theme.palette.warning.dark,
  }}
/>
```

---

## Theme Overrides Pattern

### Global Component Overrides
```javascript
const theme = createTheme({
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',    // Remove uppercase
          fontWeight: 600,
        },
        contained: {
          boxShadow: 'none',
        }
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: theme.shadows[1],
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(...)',
        }
      }
    }
  }
})
```

---

## Responsive Design with Theme

### Breakpoints
```jsx
const theme = useTheme()
const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))

// Or in sx prop
<Box sx={{
  fontSize: { xs: '14px', sm: '16px', md: '18px', lg: '20px' }
}}>
```

### Grid with Theme Spacing
```jsx
<Grid container spacing={3}>  {/* 24px gap using theme.spacing(3) */}
  <Grid item xs={12} md={6}>   {/* Responsive columns */}
</Grid>
```

---

## Migration Checklist

- [x] App.jsx - Add theme configuration
- [x] App.jsx - Use CssBaseline
- [x] AdminTournamentList - Replace hardcoded colors
- [x] AdminTournamentDetail - Replace hardcoded colors
- [x] AdminCategoryDetail - Replace hardcoded colors
- [x] RefereeCategoryList - Replace hardcoded colors
- [ ] RefereeMatchList - Replace hardcoded colors
- [ ] RefereeMatchControl - Replace hardcoded colors
- [ ] JudgeMatchList - Replace hardcoded colors
- [ ] JudgeScoring - Replace hardcoded colors
- [ ] Login - Replace hardcoded colors

---

## Current Theme Configuration

### Color Palette
```javascript
{
  primary: { 
    main: '#667eea',      // Purple
    light: '#8892f0',
    dark: '#5568d3',
  },
  secondary: { 
    main: '#764ba2',      // Dark Purple
    light: '#9469c0',
    dark: '#5d3a7f',
  },
  success: { main: '#15803d' },    // Green
  warning: { main: '#d97706' },    // Orange
  error: { main: '#dc2626' },      // Red
  info: { main: '#0ea5e9' },       // Blue
  background: {
    default: '#f5f7fa',
    paper: '#ffffff',
  }
}
```

---

## Component Elevation Usage

### Paper/Card Elevation Levels
- `elevation={0}` - Flat (no shadow)
- `elevation={1}` - Subtle (used for cards/papers)
- `elevation={2}` - Light (used for dropdowns)
- `elevation={4}` - Medium (used for modals)
- `elevation={8}` - Strong (used for menus)

---

## Tips for Consistent Design

1. **Never hardcode colors** - Always use theme.palette
2. **Use sx prop** - More concise and theme-aware than style
3. **Leverage spacing** - Use theme.spacing() for consistency
4. **Use elevation** - Let MUI handle shadows via elevation prop
5. **Use component variants** - Button variant="contained" instead of custom styling
6. **Avoid inline styles** - Use sx prop for MUI theming support
7. **Use useTheme hook** - When you need dynamic theme values
8. **Global overrides** - Override components in theme, not in individual usage

---

## Benefits of Proper MUI Theme

✅ **Consistency** - All components use same color system  
✅ **Maintainability** - Change theme colors in one place  
✅ **Dark Mode Ready** - Easy to add dark mode variant  
✅ **Accessibility** - Built-in color contrast checking  
✅ **Performance** - Efficient CSS generation  
✅ **Scalability** - Easy to extend with custom colors  

---

## Next Steps

1. **Complete remaining page migrations** - Remove hardcoded colors
2. **Add dark mode** - Create theme variants
3. **Add custom typography** - Extend font scales
4. **Create component overrides** - Customize all MUI components globally
5. **Add brand colors** - Extend palette with brand-specific colors

---

## Resources

- [MUI Theme Documentation](https://mui.com/material-ui/customization/theming/)
- [MUI Palette Documentation](https://mui.com/material-ui/customization/palette/)
- [MUI Spacing Documentation](https://mui.com/material-ui/customization/spacing/)
- [MUI Shadows Documentation](https://mui.com/material-ui/customization/shadows/)

---

**Status:** ✅ Theme improvements in progress  
**Current:** 5/10 pages using proper theme  
**Dev Server:** http://localhost:5173/ (Working perfectly)
