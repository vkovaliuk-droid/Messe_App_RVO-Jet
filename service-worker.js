const CACHE_NAME = "neuero-messe-app-rvo-jet-v11";

/*
  Alle Dateien, die für den Offlinebetrieb benötigt werden.
  Groß- und Kleinschreibung entsprechend GitHub-Projekts.
*/
const OFFLINE_FILES = [
  "./",
  "./app.html",
  "./index.html",
  "./jet-filter.html",
  "./manifest.json",
  "./pdf-viewer.html",

  /*
    Gemeinsame Bilder
  */
  "./bilder/NDV_Bild_1.jpg",
  "./bilder/NDV_Bild_2.jpg",
  "./bilder/NDV_Bild_3.jpg",
  "./bilder/NDV_Bild_4.jpg",
  "./bilder/NDV_Bild_Titel.jpg",
  "./bilder/NDV_Bild_Zeichnung.webp",
  "./bilder/Neuero_Logo.png",
  "./bilder/qr-prospekte.png",

  /*
    Bilder der Hammermühle
  */
  "./bilder/getreidemuehle/RVO_Bild_Titel.webp",
  "./bilder/getreidemuehle/RVO_Bild_1.png",
  "./bilder/getreidemuehle/RVO_Bild_2.jpg",
  "./bilder/getreidemuehle/RVO_Bild_3.jpg",
  "./bilder/getreidemuehle/RVO_Bild_4.jpg",
  "./bilder/getreidemuehle/RVO_Bild_5.JPG",
  "./bilder/getreidemuehle/RVO_Bild_Zeichnung.webp",

  /*
    Bilder des Jet-Filters
  */
  "./bilder/jet-filter/Jet_Bild_Titel.webp",
  "./bilder/jet-filter/Jet_Bild_1.webp",
  "./bilder/jet-filter/Jet_Bild_2.webp",
  "./bilder/jet-filter/Jet_Bild_Zeichnung.webp",

  /*
    3-D-Modelle der Hammermühle
  */
  "./modelle/getreidemuehle/RVO-554.glb",
  "./modelle/getreidemuehle/RVO-930.glb",

  /*
    3-D-Modelle des Jet-Filters
  */
  "./modelle/jet-filter/JET-Filter_Duo.glb",
  "./modelle/jet-filter/JET-Filter_NJF2.glb",

  /*
    PDF-Dateien
    Achtung: Der Ordner heißt bei dir "Pdf" mit großem P.
  */
  "./pdf/Mahlen&Mischen_Katalog.pdf",
  "./pdf/M&M_Prospekt.pdf",

  /*
    PDF.js
  */
  "./pdfjs/pdf.mjs",
  "./pdfjs/pdf.worker.mjs",

  /*
    Externe 3-D-Bibliothek.
    Diese wird ebenfalls im App-Cache gespeichert.
  */
  "https://ajax.googleapis.com/ajax/libs/model-viewer/4.3.1/model-viewer.min.js"
];


/*
  INSTALLATION

  Jede Datei wird einzeln gespeichert. Falls eine einzelne Datei
  nicht gefunden wird, werden die übrigen Dateien trotzdem geladen.
*/
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async function (cache) {
      for (const file of OFFLINE_FILES) {
        try {
          const response = await fetch(file, {
            cache: "reload"
          });

          if (!response.ok && response.type !== "opaque") {
            throw new Error(
              "HTTP " + response.status + " bei " + file
            );
          }

          await cache.put(file, response.clone());

          console.log(
            "Offline gespeichert:",
            file
          );
        } catch (error) {
          console.error(
            "Offline-Speicherung fehlgeschlagen:",
            file,
            error
          );
        }
      }
    })
  );

  /*
    Der neue Service Worker muss nicht auf das Schließen
    der bisherigen App-Version warten.
  */
  self.skipWaiting();
});


/*
  AKTIVIERUNG

  Alte Cache-Versionen werden gelöscht.
*/
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }

            return Promise.resolve();
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});


/*
  Prüft, ob es sich um eine Datei handelt,
  bei der Safari Teilbereiche anfordern kann.
*/
function supportsRangeRequests(url) {
  const pathname = new URL(url).pathname.toLowerCase();

  return (
    pathname.endsWith(".pdf") ||
    pathname.endsWith(".glb")
  );
}


/*
  Erstellt eine Teilantwort für PDF- und GLB-Dateien.

  Safari auf dem iPad fordert größere Dateien teilweise
  abschnittsweise über einen Range-Header an.
*/
async function createRangeResponse(
  request,
  cachedResponse
) {
  const rangeHeader =
    request.headers.get("range");

  if (!rangeHeader) {
    return cachedResponse;
  }

  const fullBuffer =
    await cachedResponse.arrayBuffer();

  const totalLength =
    fullBuffer.byteLength;

  const rangeMatch =
    rangeHeader.match(/bytes=(\d+)-(\d*)/);

  if (!rangeMatch) {
    return cachedResponse;
  }

  const start =
    Number(rangeMatch[1]);

  const requestedEnd =
    rangeMatch[2]
      ? Number(rangeMatch[2])
      : totalLength - 1;

  const end =
    Math.min(requestedEnd, totalLength - 1);

  if (
    start >= totalLength ||
    start > end
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range":
          "bytes */" + totalLength
      }
    });
  }

  const partialBuffer =
    fullBuffer.slice(start, end + 1);

  const responseHeaders =
    new Headers(cachedResponse.headers);

  responseHeaders.set(
    "Accept-Ranges",
    "bytes"
  );

  responseHeaders.set(
    "Content-Range",
    "bytes " +
      start +
      "-" +
      end +
      "/" +
      totalLength
  );

  responseHeaders.set(
    "Content-Length",
    String(partialBuffer.byteLength)
  );

  return new Response(partialBuffer, {
    status: 206,
    statusText: "Partial Content",
    headers: responseHeaders
  });
}


/*
  Lädt eine vollständige Datei aus dem Cache.

  Bei einer Range-Anfrage entfernen wir den Range-Header,
  damit die vorher vollständig gespeicherte Datei gefunden wird.
*/
async function findCachedFile(request) {
  let cachedResponse =
    await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  if (request.headers.has("range")) {
    const fullRequest =
      new Request(request.url, {
        method: "GET",
        mode: request.mode,
        credentials: request.credentials,
        redirect: request.redirect
      });

    cachedResponse =
      await caches.match(fullRequest);
  }

  return cachedResponse;
}


/*
  ABRUFSTRATEGIE

  Bereits gespeicherte Dateien werden zuerst aus dem Cache geladen.
  Wenn eine Datei noch nicht vorhanden ist, wird sie aus dem Internet
  geladen und anschließend für den nächsten Offline-Aufruf gespeichert.
*/
self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    (async function () {
      const cachedResponse =
        await findCachedFile(request);

      /*
        Datei ist bereits offline vorhanden.
      */
      if (cachedResponse) {
        if (
          request.headers.has("range") &&
          supportsRangeRequests(request.url)
        ) {
          return createRangeResponse(
            request,
            cachedResponse
          );
        }

        return cachedResponse;
      }

      /*
        Datei ist noch nicht gespeichert.
        Versuche sie aus dem Internet zu laden.
      */
      try {
        const networkResponse =
          await fetch(request);

        /*
          Nur vollständige und erfolgreiche Antworten speichern.
          Status 206 ist nur ein Teil einer größeren Datei.
        */
        if (
          networkResponse &&
          (
            networkResponse.status === 200 ||
            networkResponse.type === "opaque"
          )
        ) {
          const cache =
            await caches.open(CACHE_NAME);

          try {
            await cache.put(
              request,
              networkResponse.clone()
            );
          } catch (cacheError) {
            console.error(
              "Datei konnte nicht nachträglich gespeichert werden:",
              request.url,
              cacheError
            );
          }
        }

        return networkResponse;
      } catch (networkError) {
        /*
          Bei einer Seitennavigation wird die gespeicherte
          index.html als Offline-Ausweichseite verwendet.
        */
        if (request.mode === "navigate") {
          const fallback =
            await caches.match("./index.html");

          if (fallback) {
            return fallback;
          }
        }

        return new Response(
          "Diese Datei ist offline nicht verfügbar.",
          {
            status: 503,
            statusText: "Offline",
            headers: {
              "Content-Type":
                "text/plain; charset=utf-8"
            }
          }
        );
      }
    })()
  );
});



