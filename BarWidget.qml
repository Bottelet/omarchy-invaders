import QtQuick
import qs.Commons
import qs.Ui

// Bar icon for the Invaders cabinet. Clicking goes through the shell object
// when it's there, and otherwise runs the exact IPC route a keybinding would
// use. Static icon only — nothing runs in the widget while the cabinet is
// closed, because it shares a process with the bar (kept cheap so a game
// never taxes the shell that draws your panel).
//
// The high score in the tooltip comes from the widget's own settings entry
// (the panel writes it back via updateEntryInline): a bar widget gets
// settings injected, a panel does not, and this way the widget never has to
// touch the state file.
BarWidget {
    id: root
    moduleName: "bottelet.invaders"

    readonly property int best: {
        var value = parseInt(root.setting("highScore", 0), 10)
        return isFinite(value) && value > 0 ? value : 0
    }

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: "👾"
        tooltipText: root.best > 0 ? "Invaders · high score " + root.best
                                   : "Invaders"
        foreground: Color.accent
        fixedWidth: root.bar && root.bar.vertical ? -1 : Style.space(27)
        fixedHeight: root.bar && root.bar.vertical ? Style.space(26) : -1
        onPressed: function (b) {
            if (!root.bar) return
            if (root.bar.shell && typeof root.bar.shell.toggle === "function")
                root.bar.shell.toggle(root.moduleName, "{}")
            else
                root.bar.run("omarchy-shell shell toggle bottelet.invaders")
        }
    }
}
