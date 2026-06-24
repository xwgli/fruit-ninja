var Ucren = require( "lib/ucren" );
var knife = require( "object/knife" );
var message = require( "message" );
var state = require( "state" );

var canvasLeft, canvasTop, canvasScale;

canvasLeft = canvasTop = 0;
canvasScale = 1;

exports.init = function(){
	this.fixCanvasPos();
	this.installDragger();
	this.installClicker();
	this.installFullscreenExit();
	this.installPoseInput();
};

exports.installDragger = function(){
    var dragger = new Ucren.BasicDrag({ type: "calc" });

    dragger.on( "returnValue", function( dx, dy, x, y, kf ){
    	if( kf = knife.through( ( x - canvasLeft ) / canvasScale, ( y - canvasTop ) / canvasScale ) )
            message.postMessage( kf, "slice" );
    });

    dragger.on( "startDrag", function(){
        knife.newKnife();
    });

    dragger.bind( document.documentElement );
};

exports.installClicker = function(){
    Ucren.addEvent( document, "click", function( e ){
        if( isSideBlankClick( e ) ){
            requestFullscreen();
            return;
        }

        if( state( "click-enable" ).ison() )
        	message.postMessage( "click" );
    });
};

exports.installFullscreenExit = function(){
    Ucren.addEvent( document, "dblclick", function( e ){
        if( isSideBlankClick( e ) && isFullscreen() )
            exitFullscreen();
    });
};

exports.installPoseInput = function(){
    window.gamePoseInputStart = function(){
        knife.newKnife();
    };

    window.gamePoseInputMove = function( x, y ){
        var kf = knife.through( ( x - canvasLeft ) / canvasScale, ( y - canvasTop ) / canvasScale );
        if( kf )
            message.postMessage( kf, "slice" );
    };

    window.gamePoseInputEnd = function(){
        knife.newKnife();
    };
};

exports.fixCanvasPos = function(){
	var de = document.documentElement, view = document.getElementById( "view" );

	var fix = function( e ){
	    var rect;
	    canvasScale = Math.min( de.clientWidth / 640, de.clientHeight / 480 );
	    document.documentElement.style.setProperty( "--game-scale", canvasScale );
	    rect = view.getBoundingClientRect();
	    canvasLeft = rect.left;
	    canvasTop = rect.top;
	};

	fix();

	Ucren.addEvent( window, "resize", fix );
};

function isSideBlankClick( e ){
    var view = document.getElementById( "view" ), rect, x;

    if( !view )
        return false;

    e = e || window.event;
    if( !e )
        return false;

    if( isCameraSelectEvent( e ) )
        return false;

    rect = view.getBoundingClientRect();
    x = e.clientX;

    return x < rect.left || x > rect.right;
}

function isCameraSelectEvent( e ){
    var select = document.getElementById( "camera-select" );
    var target = e.target || e.srcElement;

    return !!( select && target && ( target == select || ( select.contains && select.contains( target ) ) ) );
}

function requestFullscreen(){
    var doc = document, el = document.documentElement;

    if( isFullscreen() )
        return;

    if( el.requestFullscreen )
        el.requestFullscreen();
    else if( el.webkitRequestFullscreen )
        el.webkitRequestFullscreen();
    else if( el.mozRequestFullScreen )
        el.mozRequestFullScreen();
    else if( el.msRequestFullscreen )
        el.msRequestFullscreen();
}

function exitFullscreen(){
    var doc = document;

    if( doc.exitFullscreen )
        doc.exitFullscreen();
    else if( doc.webkitExitFullscreen )
        doc.webkitExitFullscreen();
    else if( doc.mozCancelFullScreen )
        doc.mozCancelFullScreen();
    else if( doc.msExitFullscreen )
        doc.msExitFullscreen();
}

function isFullscreen(){
    var doc = document;

    return !!( doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement );
}
