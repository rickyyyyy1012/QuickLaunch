# Design reference measurements

## Evidence status

No image files are present in `design-reference/` on the planning branch, so
there are no screenshot measurements to claim. The values below are the
provisional implementation baseline recovered from the previous WPF shell
(`9e565f4`) and should be replaced or confirmed when reference images are
provided.

## Provisional shell baseline

| Element | Provisional measurement | Source / confidence |
|---|---:|---|
| Outer window | 760 x 500 px | Previous XAML; medium |
| Minimum window | 560 x 360 px | Previous XAML; medium |
| Outer panel inset | 14 px | Previous XAML; medium |
| Panel corner radius | 16 px | Previous XAML; medium |
| Panel content margin | 12 px | Previous XAML; medium |
| Search field height | 56 px | Previous XAML; medium |
| Search field corner radius | 10 px | Previous XAML; medium |
| Search field horizontal padding | 12 px | Previous XAML; medium |
| Search icon column | 32 px | Previous XAML; medium |
| Search text size / weight | 24 px / Light | Previous XAML; medium |
| Results-to-preview gap | 12 px | Previous XAML; medium |
| Preview pane width | 250 px | Previous XAML; medium |
| Preview pane padding | 16 px | Previous XAML; medium |
| Result row vertical margin | 2 px | Previous XAML; medium |
| Result row padding | 10 px horizontal, 7 px vertical | Previous XAML; medium |
| Result row corner radius | 8 px | Previous XAML; medium |
| Result icon box | 24 x 24 px, 5 px radius | Previous XAML; medium |
| Result title size | 13 px, regular | Previous XAML; medium |
| Result subtitle size | 11 px, regular | Previous XAML; medium |
| Result category size | 10 px, regular | Previous XAML; medium |
| Preview icon box | 56 x 56 px, 12 px radius | Previous XAML; medium |
| Preview title size | 16 px, SemiBold | Previous XAML; medium |
| Preview metadata/body size | 10–11 px | Previous XAML; medium |
| Selected row | Solid accent fill, `#007AFF` | Previous XAML; medium |
| Hover row | Accent at approximately 13% opacity | Previous XAML; low |
| Panel shadow | 50 px blur, 20 px depth, 35% opacity | Previous XAML; low |

## Required measurements when references arrive

Capture at 100% display scaling and record the Windows version, display scale,
window bounds, and screenshot pixel dimensions. Measure the panel width and
height, search field height, row height, icon bounds, font family/size/weight,
all paddings and gaps, corner radii, section-header treatment, selected and
hover states, preview-pane proportions, and shadow spread/opacity. Record both
light and dark references if available; do not infer missing values from the
provisional baseline.
