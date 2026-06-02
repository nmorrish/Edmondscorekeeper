# Setting up OBS and Middleware

OBS requires a python script to act as a bridge to the scorecard. Here is ow to set that up

# Step 1: OBS Setup

OBS requires the following:

1. Download and install the [Source Record](https://obsproject.com/forum/resources/source-record.1285/) plugin on OBS 
2. Create 1 Scene per camera. Composite split screen footage counts as a "camera". 
    - Download [Multicam_for_Video_Review_V2.json](https://github.com/nmorrish/Edmondscorekeeper/blob/dev-branch/OBS/Multicam_for_Video_Review_V2.json) if you want a quick and easy scene collection.
    - Import it by going to OBS and selecting 'Scene Collection -> Import', then select 'Multicam for Video Review'in the Scene Collection list.
    - Ensure each Scene has a unique name (Scene 0, Scene 1, Scene 2, etc)
3. Enable OBS WebSocket (Tools -> WebSocket Server Settings -> Enable WebSocket Server -> Apply)
4. For each Scene: right click -> Filters, and then set:
    - A unique Path. Easiest way is to append cam1, cam2, cam3, etc to the existing Path (e.g. /home/user/**cam1**) 
    - Replay Buffer to 80s (scroll down, its there)
5. Take note of the WebSocket Connect info (Tools -> WebSocket Server Settings -> Show Connect Info)
    - You will need to know the Server IP (Best Guess seems to work just fine), Server Port, and Server Password for the next step

# Step 2: Configure Python Middleware

1. Enter Websocket Server Settings in `obs_middleware.py`, look for the following variable under # Configuration and set them accordingly:
    - `OBS_HOST` => Server IP
    - `OBS_PORT` => Server Port
    - `OBS_PASSWORD` => Server Password
2. Enter Score Card settings in `obs_middleware.py`, look for the following variable under # Configuration and set them accordingly:
    - `RING_NUMBER` => Ring OBS will be recording. Enter a single number (e.g. `RING_NUMBER  = 1`, `RING_NUMBER  = 2`, etc) 
    - `SSE_URL` => The path you would enter in your URI to access `requestJudgementSSE.php` (e.g. `SSE_URL= "http://localhost/Edmondscorekeeper/phpFiles/requestJudgementSSE.php"`)
    - `UPLOAD_URL` The path you would enter in your URI to access `uploadOBSClip.php` (e.g. `UPLOAD_URL   = "http://localhost/Edmondscorekeeper/phpFiles/uploadOBSClip.php"`)
3. (OPTIONAL) Adjust Buffer padding to your preferences. This will be additional time spent recording before and after the Start/Stop button is pressed. Default padding is 5 seconds on start and finish.
    - `PRE_BUFFER_MS` => amount of recording time to include before the start button is pressed, in milliseconds (e.g. `PRE_BUFFER_MS  = 5_000`) 
    - `POST_BUFFER_MS` => amount of time to continue recording after the stop button is pressed, in milliseconds (e.g. `POST_BUFFER_MS = 5_000`)
4. Open a command console and navigate to the location containing `obs_middleware.py`
5. Create a virtual Environment `$ python3 -m venv venv`
6. Activate virtual environment if not active or if already created `$ source venv/bin/activate`
7. Install pip requirements `$ pip install -r requirements.txt`
8. Run the script `$ python3 obs_middleware.py`


The console should connect to OBS Cameras and the score card SSE. 

Clicking the Start/Stop Match button on the score table page will automatically trigger a save of the match recording.

Be sure to wait for the message `Signal (exchange_id) complete`. This indicates videos have finished saving and uploading.