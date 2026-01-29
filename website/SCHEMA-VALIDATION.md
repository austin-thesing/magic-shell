# Schema Markup Validation Guide

This guide helps you validate the schema markup implementation on the Magic Shell website.

## Quick Validation

### 1. Visual Inspection

View the schema markup in your browser:

```bash
# Start the dev server
cd website
npm run dev

# Open in browser
open http://localhost:4321
```

Then:

1. Right-click → "View Page Source"
2. Search for `application/ld+json`
3. You should see multiple JSON-LD blocks with schema data

### 2. Google Rich Results Test

**Best for:** Testing what Google will see

```
1. Build and deploy the site (or use production URL)
2. Go to: https://search.google.com/test/rich-results
3. Enter URL: https://mshell.dev
4. Click "Test URL"
5. Wait for results
```

**Expected Results:**

- ✅ SoftwareApplication detected
- ✅ HowTo detected
- ✅ FAQPage detected
- ✅ Organization detected
- ✅ WebSite detected
- ⚠️ No errors or critical warnings

### 3. Schema.org Validator

**Best for:** Validating JSON-LD syntax

```
1. Go to: https://validator.schema.org/
2. Paste your URL or JSON-LD directly
3. Click "Run Test"
```

**Expected Results:**

- ✅ Valid JSON-LD syntax
- ✅ All required properties present
- ✅ Proper type definitions
- ⚠️ Warnings are OK, errors should be fixed

## Detailed Testing

### Homepage Schema

**URL:** https://mshell.dev

**Expected Schema Types:**

1. Organization
2. WebSite (with SearchAction)
3. SoftwareApplication
4. HowTo
5. FAQPage

**Validation Steps:**

```javascript
// In browser console:
const schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
schemas.forEach((s, i) => {
  console.log(`Schema ${i + 1}:`, JSON.parse(s.textContent));
});
```

**Check for:**

- [ ] All URLs are fully qualified (https://mshell.dev/...)
- [ ] Version number matches current release (0.2.14)
- [ ] Feature list is accurate and up-to-date
- [ ] FAQ answers match actual functionality
- [ ] HowTo steps are clear and actionable

### Documentation Pages

**Example URL:** https://mshell.dev/getting-started/installation/

**Expected Schema Types:**

1. Organization (inherited)
2. TechArticle
3. BreadcrumbList

**Validation Steps:**

1. Visit any docs page
2. View source
3. Check for schema in `<head>`
4. Verify article title matches page title
5. Verify breadcrumbs match navigation path

## Common Issues and Fixes

### Issue: Missing Required Properties

**Error:** "Missing required property: [property name]"

**Fix:**

1. Check schema.org documentation for required properties
2. Add missing property to Schema.astro component
3. Ensure value is not null or undefined

### Issue: Invalid URL Format

**Error:** "Invalid URL" or "URL must be fully qualified"

**Fix:**

```astro
// Bad
url: "/getting-started"

// Good
url: "https://mshell.dev/getting-started"
```

### Issue: Invalid Date Format

**Error:** "Invalid date format"

**Fix:**

```javascript
// Bad
datePublished: "2024-01-01";

// Good
datePublished: "2024-01-01T00:00:00+00:00";
```

### Issue: Duplicate @type

**Error:** "Duplicate type definition"

**Fix:**

- Use `@graph` to combine multiple schemas
- Ensure each entity has unique `@id`
- Reference entities using `@id` instead of duplicating

### Issue: Content Mismatch

**Warning:** "Schema content doesn't match page content"

**Fix:**

- Ensure schema accurately represents visible content
- Don't markup content that doesn't exist on page
- Update schema when page content changes

## Automated Testing

### Using Playwright

Create a test file to validate schema:

```javascript
// tests/schema.spec.js
import { test, expect } from "@playwright/test";

test("homepage has valid schema", async ({ page }) => {
  await page.goto("https://mshell.dev");

  // Get all schema scripts
  const schemas = await page.$$eval('script[type="application/ld+json"]', (scripts) => scripts.map((s) => JSON.parse(s.textContent)));

  // Check we have schemas
  expect(schemas.length).toBeGreaterThan(0);

  // Find specific schema types
  const hasOrganization = schemas.some((s) => s["@type"] === "Organization" || s["@graph"]?.some((g) => g["@type"] === "Organization"));
  expect(hasOrganization).toBe(true);

  const hasSoftware = schemas.some((s) => s["@type"] === "SoftwareApplication" || s["@graph"]?.some((g) => g["@type"] === "SoftwareApplication"));
  expect(hasSoftware).toBe(true);
});
```

Run test:

```bash
npx playwright test tests/schema.spec.js
```

## Monitoring in Production

### Google Search Console

1. Go to: https://search.google.com/search-console
2. Add property: https://mshell.dev
3. Navigate to: Enhancements → Structured Data
4. Monitor:
   - Valid items count
   - Errors and warnings
   - Rich result impressions
   - Click-through rates

### Regular Checks

**Weekly:**

- [ ] Check Search Console for new errors
- [ ] Monitor rich result impressions
- [ ] Review click-through rates

**After Updates:**

- [ ] Validate schema after version bumps
- [ ] Update softwareVersion in schema
- [ ] Test with Rich Results Test
- [ ] Check for new warnings

**Monthly:**

- [ ] Review FAQ accuracy
- [ ] Update feature list if needed
- [ ] Check for new schema.org types
- [ ] Audit competitor implementations

## Rich Result Preview

### Expected Appearance in Google

**Software Rich Result:**

```
Magic Shell
https://mshell.dev
★★★★★ Free
Transform natural language into terminal commands...
• Natural language translation
• Multiple AI providers
• Interactive TUI mode
[Download] [Documentation]
```

**FAQ Rich Result:**

```
Magic Shell - Natural Language to Terminal Commands
https://mshell.dev
Transform natural language into terminal commands...

▼ What is Magic Shell?
▼ How do I install Magic Shell?
▼ Is Magic Shell free to use?
```

**HowTo Rich Result:**

```
How to Install and Use Magic Shell
https://mshell.dev
⏱ 5 minutes • Free

1. Install Magic Shell
   Run: bun add -g @austinthesing/magic-shell

2. Configure API Key
   Run: msh --setup

3. Start Using Magic Shell
   For TUI mode: mshell
```

## Troubleshooting

### Schema Not Detected

**Possible Causes:**

1. JavaScript rendering issue
2. Schema in wrong location (must be in `<head>`)
3. Invalid JSON syntax
4. Schema blocked by robots.txt

**Debug Steps:**

```bash
# Check if schema is in HTML
curl https://mshell.dev | grep "application/ld+json"

# Validate JSON syntax
curl https://mshell.dev | grep -A 50 "application/ld+json" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)))"
```

### Rich Results Not Appearing

**Note:** Rich results may take weeks to appear after implementation.

**Requirements:**

- Valid schema markup
- No critical errors
- Sufficient search volume
- Google's discretion (not guaranteed)

**Check:**

1. Schema is valid (no errors)
2. Content matches schema
3. Page is indexed by Google
4. No manual actions in Search Console

## Resources

### Validation Tools

- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema Markup Validator](https://validator.schema.org/)
- [Google Search Console](https://search.google.com/search-console)
- [Bing Webmaster Tools](https://www.bing.com/webmasters)

### Documentation

- [Schema.org](https://schema.org/)
- [Google Search Central](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [JSON-LD Specification](https://json-ld.org/)

### Testing Tools

- [Structured Data Linter](http://linter.structured-data.org/)
- [Schema Markup Generator](https://technicalseo.com/tools/schema-markup-generator/)
- [Rich Results Test API](https://developers.google.com/search/apis/rich-results-test)

## Next Steps

After validation:

1. **Monitor Performance**
   - Track rich result impressions in Search Console
   - Monitor click-through rates
   - Compare to baseline metrics

2. **Iterate and Improve**
   - Add new schema types as content grows
   - Update existing schemas with new features
   - Test different descriptions and titles

3. **Stay Updated**
   - Follow Google Search Central blog
   - Monitor schema.org for new types
   - Review competitor implementations
   - Adapt to search engine updates
