// track GeoJSON maps loading status
window.firstMapInitialize = false;
window.secondMapInitialize= false;
let mapPresent;
let selectedPolygons = []; // to store selected/clicked polygons
let lastOp = null; // track the last operation (intersect/union)
let currentView = 'view1'; // to set  display map

// store the result polygons (result of operations) and invisible polygons for each solution
let resultPolygon1 = [];
let invisiblePolygons1 = [];
let resultPolygon2 = [];
let invisiblePolygons2 = [];

let invisiblePolygons = [];

// colors of selected and desecled polygons
const selectedColor = 'yellow'; 
const defaultColor = '#3388ff'; 

// // Load the initial map (Solution 1) on page load (uncomment if it is needed)
// window.onload = function () {
//     document.getElementById('solution1').classList.add('active');
//     loadGeoJSONMapData('map', 'SE_State_Management_Polygons_1.json');
//     window.firstMapInitialize = true;
// };

// event listeners for solution buttons
document.getElementById('view1').addEventListener('click', function () {
    currentView = 'view1';
    document.getElementById('view1').classList.add('active');
    document.getElementById('view2').classList.remove('active');
    
    reloadCurrentSolution(); 
});

document.getElementById('view2').addEventListener('click', function () {
    currentView = 'view2';
    document.getElementById('view2').classList.add('active');
    document.getElementById('view1').classList.remove('active');
    reloadCurrentSolution(); 
});

// clears any selected polygons and reloads current solution map
function reloadCurrentSolution() {
    selectedPolygons = [];
    if (currentView === 'view1') {
        loadGeoJSONMapData('map', 'SE_State_Management_Polygons_1.json', resultPolygon1, invisiblePolygons1);
    } else if (currentView === 'view2') {
        loadGeoJSONMapData('map', 'SE_State_Management_Polygons_2.json', resultPolygon2, invisiblePolygons2);
    }
}

// union and intersection buttons event listeners
document.getElementById('intersectionBtn').addEventListener('click', function () {
    if (selectedPolygons.length === 2) {
        calculateIntersection(selectedPolygons);
        lastOp = 'intersect';
    }
});

document.getElementById('unionBtn').addEventListener('click', function () {
    if (selectedPolygons.length === 2) {
        calculateUnion(selectedPolygons);
        lastOp = 'union';
    }
});

// reset the map to its initial state, clearing any operations and selections
function resetMap() {
    selectedPolygons = [];
    lastOp = null;

    if (currentView === 'view1') {
        resultPolygon1 = [];
        invisiblePolygons1 = [];
        loadGeoJSONMapData('map', 'SE_State_Management_Polygons_1.json');
    } else {
        resultPolygon2 = [];
        invisiblePolygons2 = [];
        loadGeoJSONMapData('map', 'SE_State_Management_Polygons_2.json');
    }

    document.getElementById('result').textContent = "Map reset to its initial state.";
    document.getElementById('statistics').textContent = "No polygons selected.";
}
// click reset
document.getElementById('resetBtn').addEventListener('click', function () {
    resetMap();
});

// load GeoJSON data for a map, and optionally re-add the result polygon and hide polygons
function loadGeoJSONMapData(mapContainerId, geojsonUrl, resultPolygons = [], invisiblePolygons = []) {
    fetch(geojsonUrl)
        .then(response => response.json())
        .then(mapData => {
            initMap(mapContainerId, mapData);

            // re-add the result polygons for the current solution if they exist
            if (resultPolygons && resultPolygons.length > 0) {
                resultPolygons.forEach(polygon => {
                    polygon.addTo(mapPresent);
                });
            }

            console.log('Before hiding polygons:', invisiblePolygons);

             // remove the invisible polygons from the map 
             // limitation happens here polygon layer from geojson file is not being properly added to the map
             if (invisiblePolygons && invisiblePolygons.length > 0) {
                invisiblePolygons.forEach(polygon => {
                    console.log('Trying to remove polygon:', polygon);
                    if (polygon && mapPresent.hasLayer(polygon)) {
                        mapPresent.removeLayer(polygon); // Remove only if the layer exists
                        console.log('Polygon removed:', polygon);
                    } else {
                        console.log('Polygon not found on the map or invalid:', polygon);
                    }
                });
            }
        })
        .catch(error => console.error('Error loading GeoJSON:', error));
}

// initialize the map
function initMap(mapContainerId, mapData) {
    const mapContainer = document.getElementById(mapContainerId);
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    if (mapPresent) {
        mapPresent.remove();
        mapPresent = null;
    }

    mapPresent = L.map(mapContainerId).setView([48.85825679985474, 2.293885230445862], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapPresent);

    L.geoJSON(mapData, {
        onEachFeature: function (feature, layer) {
            layer.on('click', function () {
                handlePolygonClick(layer, feature);
            });
        }
    }).addTo(mapPresent);
}

// handle click polygon events
function handlePolygonClick(layer) {
    const isSelected = selectedPolygons.includes(layer);

    if (isSelected) {
        selectedPolygons = selectedPolygons.filter(polygon => polygon !== layer);
        layer.setStyle({ color: defaultColor });
    } else {
        selectedPolygons.push(layer);
        layer.setStyle({ color: selectedColor });
    }

    calculateTotalArea();
}

// calculate the total area of selected polygons and display it in the statistics column
function calculateTotalArea() {
    let totalArea = 0;

    selectedPolygons.forEach(polygon => {
        const jstsPolygon = convertLeafletPolygonToJSTS(polygon);
        const projectedPolygon = projectPolygonToMeters(jstsPolygon);
        totalArea += projectedPolygon.getArea();
    });

    const areaText = totalArea > 0 ? `Total area: ${totalArea.toFixed(2)} square meters` : 'No polygons selected';
    document.getElementById('statistics').textContent = areaText;
}

// project the polygon to Web Mercator (EPSG:3857) so that area is in meters
function projectPolygonToMeters(jstsPolygon) {
    const geometryFactory = new jsts.geom.GeometryFactory();
    const coords = jstsPolygon.getCoordinates();

    const projectedCoords = coords.map(coord => {
        const point = L.latLng(coord.y, coord.x);
        const projected = L.CRS.EPSG3857.project(point);
        return new jsts.geom.Coordinate(projected.x, projected.y);
    });

    const linearRing = geometryFactory.createLinearRing(projectedCoords);
    return geometryFactory.createPolygon(linearRing);
}

// calculate intersection using JSTS
function calculateIntersection(selectedPolygons) {
    try {
        const jstsPolygon1 = convertLeafletPolygonToJSTS(selectedPolygons[0]);
        const jstsPolygon2 = convertLeafletPolygonToJSTS(selectedPolygons[1]);

        const intersection = jstsPolygon1.intersection(jstsPolygon2);

        if (intersection.isEmpty()) {
            updateResult("No intersection found.");
            return;
        }

        const geojsonWriter = new jsts.io.GeoJSONWriter();
        const intersectionGeoJSON = geojsonWriter.write(intersection);

        let intersectionResult = L.geoJSON(intersectionGeoJSON, {
            style: { color: 'green' }
        }).bindPopup("Intersection");

        // make intersection result clickable to show its area
        intersectionResult.on('click', function () {
            const intersectedPolygon = convertLeafletPolygonToJSTS(intersectionResult.getLayers()[0]);
            const projectedPolygon = projectPolygonToMeters(intersectedPolygon);
            const intersectedArea = projectedPolygon.getArea();
            document.getElementById('statistics').textContent = `Intersection area: ${intersectedArea.toFixed(2)} square meters`;
        });
         // add the intersection result to the map
        intersectionResult.addTo(mapPresent);

         // remove the selected polygons from the map and store them in invisiblePolygons
         selectedPolygons.forEach(polygon => {
            if (mapPresent.hasLayer(polygon)) {
                mapPresent.removeLayer(polygon); // remove from the map
                invisiblePolygons.push(polygon); // store in invisiblePolygons
            }
        });

         // store the result in resultPolygon1 and store hidden polygons
         if (currentView === 'view1') {
            resultPolygon1 = [intersectionResult];
        } else {
            resultPolygon2 = [intersectionResult];
        }

        updateResult("Intersection result found!");
    } catch (error) {
        updateResult("Error at calculating intersection.");
    }
}

// calculate union using JSTS
function calculateUnion(selectedPolygons) {
    try {
        const jstsPolygon1 = convertLeafletPolygonToJSTS(selectedPolygons[0]);
        const jstsPolygon2 = convertLeafletPolygonToJSTS(selectedPolygons[1]);

        const union = jstsPolygon1.union(jstsPolygon2);

        const geojsonWriter = new jsts.io.GeoJSONWriter();
        const unionGeoJSON = geojsonWriter.write(union);

        let unionResult = L.geoJSON(unionGeoJSON, {
            style: { color: 'green' }
        }).bindPopup("Union");

        // make union result clickable to show its area
        unionResult.on('click', function () {
            const unitedPolygon = convertLeafletPolygonToJSTS(unionResult.getLayers()[0]);
            const projectedPolygon = projectPolygonToMeters(unitedPolygon);
            const unitedArea = projectedPolygon.getArea();
            document.getElementById('statistics').textContent = `Union area: ${unitedArea.toFixed(2)} square meters`;
        });

    // add the intersection result to the map
    unionResult.addTo(mapPresent);

    // remove the selected polygons from the map and store them in hiddenPolygons
    selectedPolygons.forEach(polygon => {
        if (mapPresent.hasLayer(polygon)) {
            mapPresent.removeLayer(polygon); // Remove the polygon from the map
        }
    });


        if (currentView === 'view1') {
            resultPolygon1 = [unionResult];
            invisiblePolygons1 = [...selectedPolygons]; // store the removed polygons for hiding
           
        } else {
            resultPolygon2 = [unionResult];
            invisiblePolygons2 = [...selectedPolygons]; // store the removed polygons for hiding
        }

        updateResult("Union result found!");
    } catch (error) {
        updateResult("Error at calculating union.");

    }
}

// update result message
function updateResult(message) {
    document.getElementById('result').textContent = message;
}

// convert Leaflet polygon to JSTS geometry
function convertLeafletPolygonToJSTS(leafletPolygon) {
    let latlngs = leafletPolygon.getLatLngs()[0];
    latlngs = ensureClosedLinearRing(latlngs.map(ll => [ll.lng, ll.lat]));
    const coordinates = latlngs.map(point => new jsts.geom.Coordinate(point[0], point[1]));

    const geometryFactory = new jsts.geom.GeometryFactory();
    const linearRing = geometryFactory.createLinearRing(coordinates);
    return geometryFactory.createPolygon(linearRing);
}

// for ensurint  that the polygon forms a closed LinearRing
function ensureClosedLinearRing(coordinates) {
    const firstPoint = coordinates[0];
    const lastPoint = coordinates[coordinates.length - 1];

    if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
        coordinates.push(firstPoint); 
    }

    return coordinates;
}
