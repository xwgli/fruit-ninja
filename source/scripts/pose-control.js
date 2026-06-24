(function(){
    var video = document.getElementById( "pose-video" );
    var overlay = document.getElementById( "pose-overlay" );
    var view = document.getElementById( "view" );
    var cameraSelect = document.getElementById( "camera-select" );
    var ctx;
    var pose;
    var cameraStream;
    var frameRequest;
    var frameTime = 0;
    var selectedDeviceId = "";
    var cameraDisabled = false;
    var activeHands = {};
    var trail = {};
    var smooth = {};
    var handHistory = {};
    var lastEventAt = {};
    var lastInputPoint = {};
    var moveTimers = [];
    var loadingClearTimer = null;
    var hasLoadingError = false;
    var lastMissingAt = 0;

    if( !video || !overlay || !view )
        return;

    overlay.width = 640;
    overlay.height = 480;
    ctx = overlay.getContext( "2d" );

    reportLoading( "正在加载摄像头控制脚本" );

    if( window.Pose )
        startPose();
    else
        window.addEventListener( "load", function(){
            if( window.Pose )
                startPose();
            else
                reportError( "摄像头玩法加载失败：MediaPipe 本地文件未加载" );
        });

    function startPose(){
        reportLoading( "正在加载 MediaPipe 姿态模型" );

        try{
            pose = new Pose({
                locateFile: function( file ){
                    return "vendor/mediapipe/" + file;
                }
            });
        }catch( e ){
            reportError( "MediaPipe 姿态模型加载失败：" + formatError( e ) );
            clearOverlay();
            return;
        }

        pose.setOptions({
            modelComplexity: 0,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.55,
            minTrackingConfidence: 0.55
        });

        pose.onResults( handlePoseResults );

        Promise.resolve()
            .then(function(){
                if( pose.initialize )
                    return pose.initialize();
            })
            .then(function(){
                reportLoading( "MediaPipe 姿态模型加载完成" );
                return startCamera( selectedDeviceId );
            })
            .then(function(){
                reportLoading( "摄像头已启动，正在识别人体姿态" );
                return refreshCameraList();
            })
            .catch(function( e ){
                reportError( "摄像头玩法加载失败：" + formatError( e ) );
                clearOverlay();
            });
    }

    function startCamera( deviceId ){
        var constraints;

        cameraDisabled = false;
        reportLoading( "正在请求摄像头权限" );

        if( !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia )
            return Promise.reject( new Error( "浏览器不支持摄像头访问" ) );

        stopCamera();

        constraints = {
            video: {
                width: 640,
                height: 480
            }
        };

        if( deviceId )
            constraints.video.deviceId = { exact: deviceId };
        else
            constraints.video.facingMode = "user";

        return navigator.mediaDevices.getUserMedia( constraints )
            .then(function( stream ){
                cameraStream = stream;
                video.srcObject = stream;
                return video.play();
            })
            .then(function(){
                runCameraFrame();
            });
    }

    function stopCamera(){
        if( frameRequest ){
            cancelAnimationFrame( frameRequest );
            frameRequest = null;
        }

        if( cameraStream ){
            cameraStream.getTracks().forEach(function( track ){
                track.stop();
            });
            cameraStream = null;
        }

        video.srcObject = null;
        endAllHands();
        clearOverlay();
    }

    function runCameraFrame(){
        var currentTime = video.currentTime;

        if( !video.paused && currentTime !== frameTime ){
            frameTime = currentTime;
            Promise.resolve( pose.send({ image: video }) ).then(queueCameraFrame, queueCameraFrame);
            return;
        }

        queueCameraFrame();
    }

    function queueCameraFrame(){
        frameRequest = requestAnimationFrame( runCameraFrame );
    }

    function refreshCameraList(){
        if( !cameraSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices )
            return Promise.resolve();

        return navigator.mediaDevices.enumerateDevices().then(function( devices ){
            var cameras = devices.filter(function( device ){
                return device.kind == "videoinput";
            });

            cameraSelect.innerHTML = "";
            cameraSelect.style.display = cameras.length ? "block" : "none";

            cameras.forEach(function( device, index ){
                var option = document.createElement( "option" );
                option.value = device.deviceId;
                option.text = device.label || ( "摄像头 " + ( index + 1 ) );
                cameraSelect.appendChild( option );
            });

            if( cameras.length ){
                var closeOption = document.createElement( "option" );
                closeOption.value = "__off";
                closeOption.text = "关闭摄像头";
                cameraSelect.appendChild( closeOption );
            }

            if( cameras.length ){
                if( !selectedDeviceId || !cameras.some(function( device ){ return device.deviceId == selectedDeviceId; }) )
                    selectedDeviceId = cameras[0].deviceId;
                cameraSelect.value = cameraDisabled ? "__off" : selectedDeviceId;
            }
        });
    }

    if( cameraSelect ){
        [ "mousedown", "mouseup", "click", "dblclick" ].forEach(function( type ){
            cameraSelect.addEventListener( type, function( e ){
                e.stopPropagation();
            });
        });

        cameraSelect.addEventListener( "change", function(){
            if( cameraSelect.value == "__off" ){
                cameraDisabled = true;
                stopCamera();
                reportLoading( "摄像头已关闭" );
                return;
            }

            selectedDeviceId = cameraSelect.value;
            reportLoading( "正在切换摄像头" );
            startCamera( selectedDeviceId )
                .then(function(){
                    reportLoading( "摄像头切换完成" );
                    return refreshCameraList();
                })
                .catch(function( e ){
                    reportError( "摄像头切换失败：" + formatError( e ) );
                });
        });
    }

    function reportLoading( text ){
        if( hasLoadingError )
            return;

        if( window.gameLoadingLog )
            window.gameLoadingLog( text );

        clearLoadingLater();
    }

    function reportError( text ){
        hasLoadingError = true;
        if( loadingClearTimer ){
            window.clearTimeout( loadingClearTimer );
            loadingClearTimer = null;
        }

        if( window.gameLoadingLog )
            window.gameLoadingLog( text, true );
    }

    function clearLoadingLater(){
        if( loadingClearTimer )
            window.clearTimeout( loadingClearTimer );

        loadingClearTimer = window.setTimeout( function(){
            loadingClearTimer = null;
            if( window.gameLoadingClear )
                window.gameLoadingClear();
        }, 1800 );
    }

    function formatError( e ){
        if( !e )
            return "未知错误";

        if( e.name )
            return e.name;

        if( e.message )
            return e.message;

        return String( e );
    }

    function handlePoseResults( results ){
        var landmarks = results.poseLandmarks;
        var now = Date.now();
        var hands = [];

        drawOverlay( landmarks );

        if( landmarks ){
            addHand( hands, "left", landmarks[15] );
            addHand( hands, "right", landmarks[16] );
        }

        if( hands.length )
            lastMissingAt = 0;
        else if( !lastMissingAt )
            lastMissingAt = now;

        updateHandInput( hands, now );

        if( lastMissingAt && now - lastMissingAt > 180 )
            endAllHands();
    }

    function addHand( hands, name, landmark ){
        if( !landmark || landmark.visibility < 0.55 )
            return;

        hands.push({
            name: name,
            x: 1 - landmark.x,
            y: landmark.y,
            visibility: landmark.visibility
        });
    }

    function updateHandInput( hands, now ){
        var hand = pickDrivingHand( hands );
        var point, smoothed;

        if( !hand )
            return;

        point = mapPointToViewport( hand );
        smoothed = smoothPoint( hand.name, point );
        recordHandPoint( hand.name, smoothed, now );
        drawHandGlow( hand.name, smoothed );

        [ "left", "right" ].forEach(function( name ){
            if( name != hand.name )
                endDrag( name );
        });

        if( !activeHands[ hand.name ] )
            beginDrag( hand.name, smoothed );
        else
            moveDrag( hand.name, smoothed, now );
    }

    function pickDrivingHand( hands ){
        var right = null, left = null;

        hands.forEach(function( hand ){
            if( hand.name == "right" )
                right = hand;
            else if( hand.name == "left" )
                left = hand;
        });

        return right || left;
    }

    function mapPointToViewport( hand ){
        var rect = view.getBoundingClientRect();
        var x = rect.left + clamp( hand.x, 0, 1 ) * rect.width;
        var y = rect.top + clamp( hand.y, 0, 1 ) * rect.height;

        return { x: x, y: y };
    }

    function smoothPoint( name, point ){
        var prev = smooth[ name ];
        var amount = 0.72;

        if( !prev )
            smooth[ name ] = point;
        else
            smooth[ name ] = {
                x: prev.x + ( point.x - prev.x ) * amount,
                y: prev.y + ( point.y - prev.y ) * amount
            };

        return smooth[ name ];
    }

    function beginDrag( name, point ){
        activeHands[ name ] = true;
        lastEventAt[ name ] = 0;
        emitInput( "start", point );
        moveDrag( name, point, Date.now() );
    }

    function moveDrag( name, point, now ){
        var previous = lastInputPoint[ name ];
        var path;

        if( now - ( lastEventAt[ name ] || 0 ) < 16 )
            return;

        lastEventAt[ name ] = now;
        path = buildCutPath( name, point );

        if( path.length > 1 )
            dispatchPathMoves( path );
        else if( previous )
            dispatchInterpolatedMoves( previous, point );
        else
            emitInput( "move", point );

        lastInputPoint[ name ] = point;
    }

    function endDrag( name ){
        if( !activeHands[ name ] )
            return;

        activeHands[ name ] = false;
        clearMoveTimers();
        emitInput( "end", smooth[ name ] || { x: 0, y: 0 } );
        lastInputPoint[ name ] = null;
        handHistory[ name ] = [];
    }

    function endAllHands(){
        endDrag( "left" );
        endDrag( "right" );
    }

    function emitInput( type, point ){
        if( window.gamePoseInputMove ){
            if( type == "start" && window.gamePoseInputStart )
                window.gamePoseInputStart( point.x, point.y );
            else if( type == "move" )
                window.gamePoseInputMove( point.x, point.y );
            else if( type == "end" && window.gamePoseInputEnd )
                window.gamePoseInputEnd( point.x, point.y );
            return;
        }

        dispatchMouse( type == "start" ? "mousedown" : type == "end" ? "mouseup" : "mousemove", point );
    }

    function dispatchMouse( type, point ){
        var event;

        if( !point )
            return;

        event = new MouseEvent( type, {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            screenX: point.x,
            screenY: point.y,
            button: 0,
            buttons: type == "mouseup" ? 0 : 1,
            view: window
        });

        ( type == "mousedown" ? document.documentElement : document ).dispatchEvent( event );
    }

    function dispatchInterpolatedMoves( from, to ){
        var dx = to.x - from.x;
        var dy = to.y - from.y;
        var distance = Math.sqrt( dx * dx + dy * dy );
        var steps = Math.min( 10, Math.max( 1, Math.ceil( distance / 22 ) ) );
        var i;

        clearMoveTimers();

        for( i = 1; i <= steps; i ++ )
            scheduleMove( {
                x: from.x + dx * i / steps,
                y: from.y + dy * i / steps
            }, i * 8 );
    }

    function dispatchPathMoves( path ){
        var i;

        clearMoveTimers();
        emitInput( "move", path[0] );

        for( i = 1; i < path.length; i ++ )
            scheduleMove( path[i], i * 6 );
    }

    function recordHandPoint( name, point, now ){
        var points = handHistory[ name ] = handHistory[ name ] || [];

        points.push({
            x: point.x,
            y: point.y,
            time: now
        });

        while( points.length > 5 )
            points.shift();
    }

    function buildCutPath( name, current ){
        var points = handHistory[ name ] || [];
        var from, to, predicted, distance;

        if( points.length < 2 )
            return [ current ];

        from = points[ Math.max( 0, points.length - 4 ) ];
        to = points[ points.length - 1 ];
        predicted = predictPoint( points );
        distance = pointDistance( from, predicted );

        if( distance < 28 )
            return [ current ];

        return densifyPath( from, predicted, distance );
    }

    function predictPoint( points ){
        var latest = points[ points.length - 1 ];
        var previous = points[ points.length - 2 ];
        var rect = view.getBoundingClientRect();
        var dt = Math.max( 16, latest.time - previous.time );
        var lead = Math.min( 44, Math.max( 18, dt * 0.75 ) );
        var vx = ( latest.x - previous.x ) / dt;
        var vy = ( latest.y - previous.y ) / dt;

        return {
            x: clamp( latest.x + vx * lead, rect.left, rect.right ),
            y: clamp( latest.y + vy * lead, rect.top, rect.bottom )
        };
    }

    function densifyPath( from, to, distance ){
        var steps = Math.min( 16, Math.max( 4, Math.ceil( distance / 14 ) ) );
        var path = [];
        var i;

        for( i = 0; i <= steps; i ++ )
            path.push({
                x: from.x + ( to.x - from.x ) * i / steps,
                y: from.y + ( to.y - from.y ) * i / steps
            });

        return path;
    }

    function pointDistance( a, b ){
        var dx = b.x - a.x;
        var dy = b.y - a.y;

        return Math.sqrt( dx * dx + dy * dy );
    }

    function scheduleMove( point, delay ){
        var timer = window.setTimeout( function(){
            emitInput( "move", point );
        }, delay );

        moveTimers.push( timer );
    }

    function clearMoveTimers(){
        while( moveTimers.length )
            window.clearTimeout( moveTimers.pop() );
    }

    function drawOverlay( landmarks ){
        clearOverlay();

        if( landmarks )
            drawSilhouette( landmarks );
    }

    function drawSilhouette( landmarks ){
        var p = mirrorLandmarks( landmarks );

        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(9, 18, 26, 0.26)";
        ctx.strokeStyle = "rgba(9, 18, 26, 0.26)";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(42, 190, 255, 0.18)";
        ctx.shadowBlur = 20;

        drawLimb( p[11], p[13], 30 );
        drawLimb( p[13], p[15], 24 );
        drawLimb( p[12], p[14], 30 );
        drawLimb( p[14], p[16], 24 );
        drawHead( p[0], p[7], p[8] );
        drawHandOrFoot( p[15], 15 );
        drawHandOrFoot( p[16], 15 );

        ctx.restore();
    }

    function drawHandGlow( name, point ){
        var rect = view.getBoundingClientRect();
        var x = ( point.x - rect.left ) / rect.width * overlay.width;
        var y = ( point.y - rect.top ) / rect.height * overlay.height;
        var radius = name == "right" ? 15 : 12;
        var gradient;

        gradient = ctx.createRadialGradient( x, y, 2, x, y, radius );
        gradient.addColorStop( 0, name == "right" ? "rgba(255, 93, 143, 0.65)" : "rgba(75, 228, 255, 0.55)" );
        gradient.addColorStop( 1, "rgba(255, 255, 255, 0)" );

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc( x, y, radius, 0, Math.PI * 2 );
        ctx.fill();
    }

    function drawHead( nose, leftEar, rightEar ){
        var x, y, r;

        if( !visible( nose ) )
            return;

        x = px( nose );
        y = py( nose ) - 10;
        r = visible( leftEar ) && visible( rightEar ) ? Math.abs( px( leftEar ) - px( rightEar ) ) * 0.45 : 22;

        ctx.beginPath();
        ctx.ellipse( x, y, clamp( r, 19, 34 ), clamp( r * 1.22, 24, 42 ), 0, 0, Math.PI * 2 );
        ctx.fill();
    }

    function drawLimb( a, b, width ){
        var ax, ay, bx, by;

        if( !visible( a ) || !visible( b ) )
            return;

        ax = px( a );
        ay = py( a );
        bx = px( b );
        by = py( b );

        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo( ax, ay );
        ctx.lineTo( bx, by );
        ctx.stroke();
    }

    function drawHandOrFoot( point, radius ){
        if( !visible( point ) )
            return;

        ctx.beginPath();
        ctx.arc( px( point ), py( point ), radius, 0, Math.PI * 2 );
        ctx.fill();
    }

    function mirrorLandmarks( landmarks ){
        return landmarks.map(function( landmark ){
            return {
                x: 1 - landmark.x,
                y: landmark.y,
                z: landmark.z,
                visibility: landmark.visibility
            };
        });
    }

    function pointsVisible( points ){
        for( var i = 0; i < points.length; i ++ )
            if( !visible( points[ i ] ) )
                return false;
        return true;
    }

    function visible( point ){
        return point && ( point.visibility === undefined || point.visibility > 0.35 );
    }

    function px( point ){
        return clamp( point.x, 0, 1 ) * overlay.width;
    }

    function py( point ){
        return clamp( point.y, 0, 1 ) * overlay.height;
    }

    function clearOverlay(){
        ctx.clearRect( 0, 0, overlay.width, overlay.height );
    }

    function clamp( value, min, max ){
        return Math.max( min, Math.min( max, value ) );
    }
}());
