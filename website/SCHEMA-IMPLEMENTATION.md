# Schema Markup Implementation

This document describes the structured data (schema.org markup) implemented for the Magic Shell marketing website.

## Overview

The website implements comprehensive JSON-LD structured data to help search engines understand the content and enable rich results in search.

## Implemented Schema Types

### 1. Organization Schema

**Location:** Homepage  
**Purpose:** Represents Magic Shell as a project/brand

**Properties:**

- Name: "Magic Shell"
- URL: https://mshell.dev
- Logo: /favicon.svg
- Description
- Social profiles (GitHub)
- Founder information

### 2. WebSite Schema

**Location:** Homepage  
**Purpose:** Enables sitelinks search box in Google

**Properties:**

- Name and URL
- Publisher reference
- SearchAction with search URL template

### 3. SoftwareApplication Schema

**Location:** Homepage  
**Purpose:** Describes Magic Shell as a developer tool

**Properties:**

- Application category: DeveloperApplication
- Operating systems: macOS, Linux, Windows
- Version: 0.2.14
- Price: Free ($0)
- Download URL (npm)
- Feature list (10 key features)
- Requirements: Node.js 18.0.0+
- Code repository
- License: MIT
- Screenshots/images

**Rich Results:** May appear in software/app searches with download links, ratings, and features

### 4. HowTo Schema

**Location:** Homepage  
**Purpose:** Step-by-step installation guide

**Steps:**

1. Install Magic Shell (via package manager)
2. Configure API Key (setup command)
3. Start Using (TUI or CLI mode)

**Properties:**

- Total time: 5 minutes
- Cost: Free
- Required tools listed
- Each step has detailed directions

**Rich Results:** May appear as step-by-step guide in search results

### 5. FAQPage Schema

**Location:** Homepage  
**Purpose:** Common questions and answers

**Questions covered:**

- What is Magic Shell?
- How to install?
- Is it free?
- What AI providers are supported?
- How does safety work?
- Difference between msh and mshell?
- Local AI model support?
- Platform support?
- Model switching?
- Keyboard shortcuts?

**Rich Results:** May appear as expandable FAQ in search results

### 6. TechArticle Schema

**Location:** Documentation pages  
**Purpose:** Marks documentation as technical articles

**Properties:**

- Headline (page title)
- Description
- Author information
- Publisher reference
- Publication/modification dates
- Main entity reference

### 7. BreadcrumbList Schema

**Location:** Documentation pages  
**Purpose:** Navigation breadcrumbs

**Properties:**

- Hierarchical navigation structure
- Position-based item list

**Rich Results:** Breadcrumb navigation in search results

## Implementation Details

### File Structure

```
website/src/components/
├── Schema.astro         # Main schema component (Organization, WebSite, SoftwareApplication, HowTo, Article, Breadcrumb)
├── FAQSchema.astro      # FAQ schema component
└── Head.astro           # Custom head for Starlight docs (injects schema)

website/src/layouts/
└── Landing.astro        # Homepage layout (includes Schema + FAQSchema)
```

### Usage

**Homepage:**

```astro
<Schema type="homepage" title={title} description={description} />
<FAQSchema />
```

**Documentation Pages:**

```astro
<Schema type="article" title={title} description={description} url={url} />
```

### Schema Combination

All schemas are combined using `@graph` to create a single JSON-LD block with multiple entities. This is the recommended approach for pages with multiple schema types.

## Validation

### Tools Used

- **Google Rich Results Test**: https://search.google.com/test/rich-results
- **Schema.org Validator**: https://validator.schema.org/

### Validation Checklist

- [x] All required properties included
- [x] Valid JSON-LD format
- [x] Accurate representation of page content
- [x] Proper use of @id for entity references
- [x] ISO 8601 date formats
- [x] Fully qualified URLs
- [x] Proper enumeration values

## Testing Instructions

### 1. Test Homepage Schema

```bash
# Visit the homepage
open https://mshell.dev

# View page source and search for "application/ld+json"
# Or use browser dev tools: Elements > <head> > <script type="application/ld+json">
```

### 2. Validate with Google Rich Results Test

```
1. Go to: https://search.google.com/test/rich-results
2. Enter URL: https://mshell.dev
3. Click "Test URL"
4. Review detected schema types and any errors/warnings
```

### 3. Validate with Schema.org Validator

```
1. Go to: https://validator.schema.org/
2. Enter URL: https://mshell.dev
3. Click "Run Test"
4. Review validation results
```

### 4. Test Documentation Pages

```
1. Visit any docs page: https://mshell.dev/getting-started/installation/
2. View source and check for TechArticle schema
3. Validate with Rich Results Test
```

## Expected Rich Results

### Google Search Features

1. **Sitelinks Search Box**
   - Appears for branded searches ("Magic Shell")
   - Allows searching directly from Google results

2. **Software Rich Results**
   - May show download link
   - Operating system compatibility
   - Price (Free)
   - Feature highlights

3. **HowTo Rich Results**
   - Step-by-step installation guide
   - Estimated time
   - Required tools

4. **FAQ Rich Results**
   - Expandable questions in search results
   - Direct answers visible
   - "People also ask" integration

5. **Breadcrumbs**
   - Navigation path in search results
   - Better UX for documentation pages

## Maintenance

### When to Update Schema

1. **Version Changes**
   - Update `softwareVersion` in Schema.astro when releasing new versions

2. **Feature Additions**
   - Add to `featureList` array in SoftwareApplication schema

3. **New FAQ Questions**
   - Add to FAQSchema.astro `mainEntity` array

4. **URL Changes**
   - Update all URL references in schema components

5. **Pricing Changes**
   - Update `offers` section (currently free)

### Best Practices

1. **Keep Accurate**
   - Schema must match visible page content
   - Don't markup content that doesn't exist
   - Update when content changes

2. **Monitor Search Console**
   - Check "Enhancements" reports regularly
   - Fix any errors promptly
   - Track rich result impressions

3. **Test Before Deploy**
   - Always validate schema before publishing
   - Use staging environment for testing
   - Check mobile and desktop rendering

## Future Enhancements

### Potential Additions

1. **VideoObject Schema**
   - When demo videos are added
   - Tutorial video content

2. **Review/AggregateRating Schema**
   - When user reviews are collected
   - GitHub stars integration

3. **Course Schema**
   - If tutorial series is created
   - Learning path content

4. **Event Schema**
   - For webinars or launch events
   - Community meetups

5. **Product Schema**
   - For premium features (if added)
   - Marketplace listings

## Resources

- [Schema.org Documentation](https://schema.org/)
- [Google Search Central - Structured Data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [JSON-LD Specification](https://json-ld.org/)
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema Markup Validator](https://validator.schema.org/)

## Support

For questions or issues with schema implementation:

1. Check validation tools for specific errors
2. Review Google Search Console enhancement reports
3. Consult schema.org documentation
4. Test with multiple validation tools
