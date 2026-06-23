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
6. Videos will be displayed on the scorecard in the reverse order of appearance in OBS. If you would like a particular video to be the first thing users see, make sure it is last on the OBS Scene list  


# Step 2: Configure Python Middleware

1. Make sure you have installed [Python 3.12.3](https://www.python.org/downloads/release/python-3123/) or later.
2. Download [obs_middleware.py](https://github.com/nmorrish/Edmondscorekeeper/blob/dev-branch/OBS/obs_middleware.py) and [requirements.txt](https://github.com/nmorrish/Edmondscorekeeper/blob/dev-branch/OBS/requirements.txt) to a folder you can access via command prompt. 
    -IMPORTANT: Both `obs_middleware.py` and `requirements.txt` must be in the same folder.
3. Open `obs_middleware.py` in a text editor and change the following variables as per your OBS settings:
    - `OBS_HOST` => Server IP (best guess works fine)
    - `OBS_PORT` => Server Port
    - `OBS_PASSWORD` => Server Password
4. Enter Score Card settings in `obs_middleware.py`:
    - `RING_NUMBER` => Ring OBS will be recording. Enter a single number (e.g. `RING_NUMBER  = 1`, `RING_NUMBER  = 2`, etc) 
    - `SSE_URL` => The path you would enter in your URI to access `requestJudgementSSE.php` (e.g. `SSE_URL= "http://localhost/Edmondscorekeeper/phpFiles/requestJudgementSSE.php"`)
    - `UPLOAD_URL` The path you would enter in your URI to access `uploadOBSClip.php` (e.g. `UPLOAD_URL   = "http://localhost/Edmondscorekeeper/phpFiles/uploadOBSClip.php"`)
5. (OPTIONAL) Adjust Buffer padding to your preferences. This will be additional time spent recording before and after the Start/Stop button is pressed. Default padding is 5 seconds on start and finish.
    - `PRE_BUFFER_MS` => amount of recording time to include before the start button is pressed, in milliseconds (e.g. `PRE_BUFFER_MS  = 5_000`) 
    - `POST_BUFFER_MS` => amount of time to continue recording after the stop button is pressed, in milliseconds (e.g. `POST_BUFFER_MS = 5_000`)
6. Open a command console and navigate to the folder containing `obs_middleware.py`
7. Create a virtual Environment by entering:
    - Linux: `$ python3 -m venv venv`
    - Windows: `> python -m venv venv`
8. Activate virtual environment if not active or if already created 
    - Linux: `$ source venv/bin/activate`
    - Windows: `> venv/Scripts/Activate`
9. Install pip requirements `$ pip install -r requirements.txt` (both Windows and Linux) 
10. Run the script
    - Linux: `$ python3 obs_middleware.py`
    - Windows: `> python obs_middleware.py`


The console should connect to OBS Cameras and the score card SSE. 

Clicking the Start/Stop Match button on the score table page will automatically trigger a save of the match recording.

Be sure to wait for the message `Signal (exchange_id) complete`. This indicates videos have finished saving and uploading.
