UPDATE "generated_content"
SET
	"artwork_url" = NULL,
	"metadata" = jsonb_set(
		jsonb_set(
			COALESCE("metadata", '{}'::jsonb) - 'artworkCredit' - 'artworkLicense' - 'artworkSourceUrl',
			'{retiredArtwork}',
			jsonb_strip_nulls(jsonb_build_object(
				'url', "artwork_url",
				'credit', "metadata"->>'artworkCredit',
				'license', "metadata"->>'artworkLicense',
				'sourceUrl', "metadata"->>'artworkSourceUrl',
				'reason', 'legacy_document_scan',
				'retiredAt', now()
			)),
			true
		),
		'{visualTemplate}',
		to_jsonb(CASE
			WHEN "category" IN ('did_you_know', 'fact') THEN 'fact_reveal'
			ELSE 'editorial_split'
		END::text),
		true
	),
	"updated_at" = now()
WHERE
	"artwork_url" IS NOT NULL
	AND (
		"artwork_url" ~* E'\\.(pdf|djvu|tiff?)(/|[?#]|$)|/page[0-9]+-'
		OR COALESCE("metadata"->>'artworkSourceUrl', '') ~* E'\\.(pdf|djvu|tiff?)(/|[?#]|$)|/page[0-9]+-'
	);
--> statement-breakpoint
UPDATE "newsroom_stories"
SET
	"image_url" = NULL,
	"image_credit" = NULL,
	"image_source_url" = NULL,
	"visual_template" = CASE
		WHEN "visual_template" = 'photo' AND "location_label" IS NOT NULL THEN 'map'
		WHEN "visual_template" = 'photo' THEN 'headline'
		ELSE "visual_template"
	END,
	"metadata" = jsonb_set(
		COALESCE("metadata", '{}'::jsonb) - 'artworkLicense',
		'{retiredArtwork}',
		jsonb_strip_nulls(jsonb_build_object(
			'url', "image_url",
			'credit', "image_credit",
			'license', "metadata"->>'artworkLicense',
			'sourceUrl', "image_source_url",
			'reason', 'legacy_document_scan',
			'retiredAt', now()
		)),
		true
	),
	"updated_at" = now()
WHERE
	"image_url" IS NOT NULL
	AND (
		"image_url" ~* E'\\.(pdf|djvu|tiff?)(/|[?#]|$)|/page[0-9]+-'
		OR COALESCE("image_source_url", '') ~* E'\\.(pdf|djvu|tiff?)(/|[?#]|$)|/page[0-9]+-'
	);
