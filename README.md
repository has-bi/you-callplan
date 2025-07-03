# Callplan Route Optimizer

A Google Apps Script solution for automatically generating optimized monthly visit plans for sales merchandisers. This system helps field sales teams efficiently plan store visits while managing priorities, geographical constraints, and time limitations.

## What is a Callplan?

A callplan is a structured schedule that defines when and which stores a sales merchandiser should visit during a specific period. It considers factors like:

- Store priority levels (P1-P8)
- Visit frequency requirements
- Geographic proximity for efficient routing
- Working hours and break times
- Time constraints and travel distances

## Features

### Core Functionality

- **Automated Route Planning**: Generates optimized weekly routes based on store priorities and locations
- **Geographic Clustering**: Groups nearby stores to minimize travel time and distance
- **Priority Management**: Handles 8 priority levels (P1-P8) with different visit frequencies
- **Fractional Visit Frequencies**: Supports partial visit frequencies (e.g., 0.79 visits/month = ~3 visits every 4 months)
- **Multi-Visit Support**: Handles stores requiring multiple visits per month with proper separation
- **Time Optimization**: Maximizes productivity within working hours while respecting break times

### Advanced Features

- **Friday Prayer Time**: Automatic handling of extended prayer breaks on Fridays
- **Utilization Management**: Ensures workload stays within manageable limits
- **W5 Support**: Utilizes 5th week when available in longer months
- **Distance Calculation**: Real-time travel distance and duration estimates
- **Google Maps Integration**: Direct navigation links for each route segment

## Configuration

### Priority Settings

Each priority level (P1-P8) can be configured with:

- **Visit Frequency**: How often stores should be visited (supports decimals)
- **Required Visits**: Number of visits per month
- **Column Mapping**: Spreadsheet column locations for each priority

### Time Settings

- **Working Hours**: 9:00 AM - 6:20 PM
- **Lunch Break**: 12:00 PM - 1:00 PM
- **Friday Prayer**: 11:30 AM - 1:00 PM
- **Buffer Time**: 5 minutes between stores
- **Default Visit Time**: 30 minutes per store

### Clustering Parameters

- **Maximum Radius**: 18km for geographic clustering
- **Store Limits**: 6-15 stores per day
- **Starting Point**: Configurable home base coordinates

## Usage

### Setup

1. Ensure your Google Sheet has the required structure with store data
2. Configure priority visit frequencies in cells B24-B31
3. Set utilization targets in cells D42-D49
4. Mark stores with "YES" in the shouldVisit column

### Running the Planner

1. Open the Google Sheet
2. Go to **Route Planner** menu
3. Click **"📅 Generate Monthly Plan"**
4. Review the generated monthly schedule in the new sheet

### Menu Options

- **📅 Generate Monthly Plan**: Creates complete monthly route plan
- **📊 Check Utilization**: Reviews current workload settings
- **🔍 Analyze Store Distribution**: Shows store coverage statistics
- **⚡ Test Fractional Distribution**: Previews fractional visit patterns
- **🔮 Preview Next Month**: Estimates next month's schedule

## Output

### Monthly Plan Sheet

The generated plan includes:

- **Executive Summary**: Key metrics and coverage statistics
- **Weekly Breakdown**: Organized by weeks with store counts and distances
- **Daily Routes**: Optimized store sequences with timing and navigation
- **Unvisited Stores**: List of stores not scheduled this month

### Route Information

For each day:

- Store visit order optimized for minimal travel
- Arrival and departure times
- Turn-by-turn navigation links
- Distance and duration estimates
- District and retailer breakdowns

## Fractional Visit Frequencies

### How It Works

Instead of visiting all stores every month, fractional frequencies allow more strategic planning:

- **0.79 visits/month** = Store visited ~3 out of every 4 months
- **0.33 visits/month** = Store visited ~1 out of every 3 months
- **2.5 visits/month** = Store visited 2-3 times per month

### Distribution Methods

- **Probability-based**: Uses consistent randomization for fair distribution
- **Geographic consideration**: Maintains clustering efficiency
- **Minimum threshold**: Frequencies below 0.1 are excluded

## Technical Requirements

- Google Sheets with appropriate permissions
- Store data with latitude/longitude coordinates
- Google Apps Script environment
- Optional: Google Maps API key for enhanced routing

## Data Structure

### Required Columns (per priority)

- Store Number, Name, Retailer, District, State
- Address, Latitude, Longitude
- Sales data, Ranking, Visibility
- shouldVisit flag (YES/NO)

### Configuration Cells

- **B24-B31**: Visit frequencies for P1-P8
- **D42-D49**: Utilization percentages
- Store data starting from row 4

## Benefits

- **Time Savings**: Eliminates manual route planning
- **Efficiency**: Optimized routes reduce travel time and fuel costs
- **Flexibility**: Supports various visit frequency strategies
- **Scalability**: Handles hundreds of stores across multiple priorities
- **Visibility**: Clear reporting on coverage and unvisited stores
- **Compliance**: Ensures fair distribution of visits over time

## Support

The system includes comprehensive logging and error handling. Use the analysis tools in the menu to troubleshoot issues or optimize settings before generating plans.
