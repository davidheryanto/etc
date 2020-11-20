/*
	* Name		: Cut Off MONITOR
	* Author	: SeHoon KIM
	* E-Mail	: SeHoonKIM.s@gmail.com
*/
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Command = Me.imports.command;
const Util = imports.misc.util;	

const GLib = imports.gi.GLib;

const St = imports.gi.St;
const Main = imports.ui.main;


let button;


// REF. http://stackoverflow.com/questions/17333982/how-do-i-call-out-to-a-command-line-program-from-a-gnome-shell-extension
function _cutOffMonitor() {
// Util.spawn(Command.getCommand())
 GLib.spawn_command_line_sync('/bin/bash -c "sleep 2 && xset dpms force off"');
}

function init() {
	button = new St.Bin({	style_class	: 'panel-button',
							reactive	: true,
							can_focus	: true,
							x_fill		: true,
							y_fill		: false,
							track_hover	: true });

	let icon = new St.Icon({style_class: 'cut-off-monitor-icon'});	// REF. http://stackoverflow.com/questions/20394840/how-to-set-a-png-file-in-a-gnome-shell-extension-for-st-icon

	button.set_child(icon);											// Set button icon
	button.connect('button-press-event', _cutOffMonitor);			// set button event
}

function enable() {
	Main.panel._rightBox.insert_child_at_index(button, 0);
}

function disable() {
	Main.panel._rightBox.remove_child(button);
}
