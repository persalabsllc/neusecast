import assert from "node:assert/strict";
import test from "node:test";
import {
  isUnsafeArtworkReference,
  resolveGeneratedArtwork,
  resolveNewsroomArtwork,
  safeFillerVisualTemplate,
  storedAutomaticArtwork,
} from "../lib/filler/artwork-policy.ts";

const documentThumbnail = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Auditoria.pdf/page1-960px-Auditoria.pdf.jpg";
const documentSource = "https://commons.wikimedia.org/wiki/File:Auditoria.pdf";
const safeImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Tryon_Palace_gardens.jpg/1920px-Tryon_Palace_gardens.jpg";
const safeSource = "https://commons.wikimedia.org/wiki/File:Tryon_Palace_gardens.jpg";
const safeMetadata = {
  origin: "automatic",
  artworkCredit: "Image: Example Creator / CC BY-SA 4.0 / Wikimedia Commons",
  artworkLicense: "CC BY-SA 4.0",
  artworkSourceUrl: safeSource,
};

test("recognizes legacy Commons document thumbnails and document titles", () => {
  assert.equal(isUnsafeArtworkReference(documentThumbnail), true);
  assert.equal(isUnsafeArtworkReference(documentSource), true);
  assert.equal(isUnsafeArtworkReference("United_States_Statutes_at_Large_Volume_113_Part_1.djvu"), true);
  assert.equal(isUnsafeArtworkReference("Baldwin's New Bern City Directory (1937)"), true);
  assert.equal(isUnsafeArtworkReference(safeImage), false);
});

test("keeps only complete, commercially reusable automatic artwork", () => {
  assert.deepEqual(storedAutomaticArtwork(safeImage, safeMetadata), {
    url: safeImage,
    credit: safeMetadata.artworkCredit,
    license: safeMetadata.artworkLicense,
    sourceUrl: safeSource,
  });
  assert.equal(storedAutomaticArtwork(documentThumbnail, {
    ...safeMetadata,
    artworkSourceUrl: documentSource,
  }), null);
  assert.equal(storedAutomaticArtwork(safeImage, {
    ...safeMetadata,
    artworkCredit: null,
  }), null);
  assert.equal(storedAutomaticArtwork(safeImage, {
    ...safeMetadata,
    artworkCredit: "Wikimedia image",
  }), null);
  assert.equal(storedAutomaticArtwork(safeImage, {
    ...safeMetadata,
    artworkLicense: "CC BY-NC 4.0",
  }), null);
});

test("sanitizes automatic and newsroom artwork at the player boundary", () => {
  assert.equal(resolveGeneratedArtwork(documentThumbnail, safeMetadata), null);
  assert.equal(resolveGeneratedArtwork(safeImage, safeMetadata)?.url, safeImage);
  assert.equal(resolveGeneratedArtwork(safeImage, { artworkCredit: "Unlicensed legacy photo" }), null);
  assert.equal(resolveGeneratedArtwork(safeImage, { origin: "manual" })?.url, safeImage);
  assert.equal(resolveNewsroomArtwork(documentThumbnail, "Image credit", documentSource), null);
  assert.equal(resolveNewsroomArtwork(safeImage, "Image credit", safeSource)?.credit, "Image credit");
});

test("uses a designed non-photo template when artwork is unavailable", () => {
  assert.equal(safeFillerVisualTemplate("fact", "photo_feature", false), "fact_reveal");
  assert.equal(safeFillerVisualTemplate("history", "archival", false), "editorial_split");
  assert.equal(safeFillerVisualTemplate("history", "archival", true), "archival");
  assert.equal(safeFillerVisualTemplate("history", "editorial_split", false), "editorial_split");
});
