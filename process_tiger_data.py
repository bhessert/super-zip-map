import geopandas as gpd
import pandas as pd
import requests
import zipfile
import io
import os

def download_and_process_zcta():
    """
    Downloads and processes ZIP Code Tabulation Areas (ZCTA) from Census TIGER/Line
    """
    # Create data directory if it doesn't exist
    if not os.path.exists('data'):
        os.makedirs('data')
    
    # URL for 2020 ZCTA boundaries
    tiger_url = "https://www2.census.gov/geo/tiger/TIGER2020/ZCTA520/tl_2020_us_zcta520.zip"
    
    print("Downloading ZCTA data...")
    response = requests.get(tiger_url)
    
    # Extract the shapefile
    print("Extracting files...")
    with zipfile.ZipFile(io.BytesIO(response.content)) as zip_ref:
        zip_ref.extractall("data")
    
    # Read the shapefile
    print("Reading shapefile...")
    zcta = gpd.read_file("data/tl_2020_us_zcta520.shp")
    
    # Rename ZCTA5CE20 (ZIP Code) column to 'zip'
    zcta = zcta.rename(columns={'ZCTA5CE20': 'zip'})
    
    # Convert to numeric ZIP codes
    zcta['zip'] = pd.to_numeric(zcta['zip'])
    
    # Keep only necessary columns
    zcta = zcta[['zip', 'geometry']]
    
    # Simplify geometries to reduce file size (adjust tolerance as needed)
    print("Simplifying geometries...")
    zcta['geometry'] = zcta['geometry'].simplify(tolerance=0.001)
    
    # Convert to GeoJSON
    print("Converting to GeoJSON...")
    geojson_path = "data/zip_codes.geojson"
    zcta.to_file(geojson_path, driver='GeoJSON')
    
    print(f"Processing complete. GeoJSON file saved to {geojson_path}")
    print(f"File size: {os.path.getsize(geojson_path) / (1024*1024):.1f} MB")
    
    return geojson_path

if __name__ == "__main__":
    download_and_process_zcta()
