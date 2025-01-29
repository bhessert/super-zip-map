import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { read, utils } from 'xlsx';

const ZIPMap = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load the Excel data
        const response = await window.fs.readFile('Zip Code File 2000.xlsx');
        const workbook = read(response, {
          cellStyles: true,
          cellFormulas: true,
          cellDates: true,
          cellNF: true,
          sheetStubs: true
        });
        
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = utils.sheet_to_json(firstSheet, { range: 6 });
        
        // Create ZIP code to centile score mapping
        const processedData = rawData.slice(1).reduce((acc, row) => {
          if (row['__EMPTY'] && !isNaN(row['__EMPTY'])) {
            acc[row['__EMPTY']] = {
              centileScore: row['__EMPTY_1'],
              city: row['__EMPTY_4'] || 'Unknown',
              state: row['__EMPTY_5'] || 'Unknown',
              population: row['__EMPTY_6'] || 0,
              bachelorsPct: (row['__EMPTY_8'] || 0) * 100,
              medianIncome: row['__EMPTY_9'] || 0
            };
          }
          return acc;
        }, {});

        setData(processedData);
        setLoading(false);
      } catch (err) {
        setError(`Error loading data: ${err.message}`);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (!data || map.current) return;

    const initializeMap = async () => {
      try {
        // Dynamically import mapboxgl
        const mapboxgl = await import('mapbox-gl');
        mapboxgl.accessToken = 'pk.eyJ1IjoiYmhlc3MwMTYiLCJhIjoiY202Z2tjY3gyMDI1YzJqcGxqdzY1d2pzNSJ9.JGl2a_Cvy6jhHZg3AwV8zg';

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/light-v10',
          center: [-98.5795, 39.8283], // Center of US
          zoom: 4
        });

        map.current.on('load', async () => {
          setMapLoaded(true);
          
          // Add navigation control
          const nav = new mapboxgl.NavigationControl();
          map.current.addControl(nav, 'top-right');

          try {
            // Load the ZIP code GeoJSON
            const geoJsonResponse = await window.fs.readFile('data/zip_codes.geojson', { encoding: 'utf8' });
            const geoJson = JSON.parse(geoJsonResponse);

            // Add centile scores to the GeoJSON features
            geoJson.features = geoJson.features.map(feature => {
              const zipCode = feature.properties.zip;
              const zipData = data[zipCode];
              if (zipData) {
                feature.properties.centileScore = zipData.centileScore;
                feature.properties.city = zipData.city;
                feature.properties.state = zipData.state;
                feature.properties.population = zipData.population;
                feature.properties.bachelorsPct = zipData.bachelorsPct;
                feature.properties.medianIncome = zipData.medianIncome;
              }
              return feature;
            });

            // Add the source and layers
            map.current.addSource('zip-codes', {
              type: 'geojson',
              data: geoJson
            });

            // Add fill layer
            map.current.addLayer({
              id: 'zip-codes-fill',
              type: 'fill',
              source: 'zip-codes',
              paint: {
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'centileScore'],
                  0, '#f7fbff',
                  25, '#deebf7',
                  50, '#9ecae1',
                  75, '#4292c6',
                  100, '#084594'
                ],
                'fill-opacity': [
                  'case',
                  ['has', 'centileScore'],
                  0.7,
                  0
                ]
              }
            });

            // Add outline layer
            map.current.addLayer({
              id: 'zip-codes-outline',
              type: 'line',
              source: 'zip-codes',
              paint: {
                'line-color': '#ffffff',
                'line-width': 0.5
              }
            });

            // Add hover effect and popup
            const popup = new mapboxgl.Popup({
              closeButton: false,
              closeOnClick: false
            });

            map.current.on('mousemove', 'zip-codes-fill', (e) => {
              if (e.features.length > 0) {
                const feature = e.features[0];
                if (feature.properties.centileScore) {
                  const html = `
                    <div class="p-2">
                      <strong>ZIP: ${feature.properties.zip}</strong><br/>
                      Centile Score: ${feature.properties.centileScore.toFixed(1)}<br/>
                      ${feature.properties.city}, ${feature.properties.state}<br/>
                      Population: ${feature.properties.population.toLocaleString()}<br/>
                      Bachelor's Degree: ${feature.properties.bachelorsPct.toFixed(1)}%<br/>
                      Median Income: $${feature.properties.medianIncome.toLocaleString()}k
                    </div>
                  `;

                  popup
                    .setLngLat(e.lngLat)
                    .setHTML(html)
                    .addTo(map.current);
                }
              }
            });

            map.current.on('mouseleave', 'zip-codes-fill', () => {
              popup.remove();
            });

          } catch (err) {
            setError(`Error loading ZIP code boundaries: ${err.message}`);
          }
        });
      } catch (err) {
        setError(`Error initializing map: ${err.message}`);
      }
    };

    initializeMap();

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, [data]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-600">Loading ZIP code data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>ZIP Code Centile Scores Map</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="h-96 w-full relative mb-4" ref={mapContainer}>
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <p className="text-gray-600">Initializing map...</p>
            </div>
          )}
        </div>
        
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Centile Score</h3>
          <div className="flex items-center space-x-2">
            <div className="flex h-4">
              {['#f7fbff', '#deebf7', '#9ecae1', '#4292c6', '#084594'].map((color, i) => (
                <div
                  key={i}
                  className="w-12"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex justify-between w-full text-xs text-gray-600">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ZIPMap;